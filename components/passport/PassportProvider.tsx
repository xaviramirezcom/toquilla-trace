"use client";

import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { log } from "@/lib/log";
import type { ClaimMode } from "@/lib/passport/types";
import { ClaimDialog } from "./ClaimDialog";
import { ConciergeFab } from "@/components/concierge/ConciergeFab";

// The chat panel is loaded on first open so it adds nothing to the passport's first load (spec 07).
// While the chunk downloads, an empty panel with a spinner shows that Ask worked.
const ConciergePanel = dynamic(() => import("@/components/concierge/ConciergePanel").then((m) => m.ConciergePanel), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-x-0 bottom-0 z-[45] grid h-[92vh] place-items-center rounded-t-[18px] bg-bg shadow-card md:inset-x-auto md:top-0 md:right-0 md:h-auto md:w-[400px] md:rounded-none md:border-l md:border-line">
      <Spinner size={24} className="text-muted" label="Loading chat" />
    </div>
  ),
});

export interface PassportClientInfo {
  code: string;
  claim: ClaimMode;
  sizeCm: number | null;
  contactEmail: string | null;
  /** Signed-in user, so feedback rows can be attributed (anonymous rows are dropped by the logger). */
  user: { userId: string; workshopId: string | null } | null;
}

interface PassportCtx extends PassportClientInfo {
  claimOpen: boolean;
  openClaim: () => void;
  closeClaim: () => void;
  /** Set after a successful claim in this tab (shows the success card before the refresh lands). */
  justClaimed: boolean;
  markClaimed: () => void;
  /** Changes on claim so the seal replays its stamp. */
  stampKey: number;
  conciergeOpen: boolean;
  openConcierge: () => void;
  closeConcierge: () => void;
}

const Ctx = createContext<PassportCtx | null>(null);

export function usePassport(): PassportCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePassport must be used inside <PassportProvider>");
  return v;
}

/** Optional variant for components that also render outside a passport (e.g. the seal in a preview). */
export function usePassportMaybe(): PassportCtx | null {
  return useContext(Ctx);
}

export function PassportProvider({ info, children }: { info: PassportClientInfo; children: ReactNode }) {
  const [claimOpen, setClaimOpen] = useState(false);
  const [justClaimed, setJustClaimed] = useState(false);
  const [stampKey, setStampKey] = useState(0);
  const [conciergeOpen, setConciergeOpen] = useState(false);
  const [conciergeMounted, setConciergeMounted] = useState(false);

  useEffect(() => {
    if (info.user) log.setContext({ user_id: info.user.userId, workshop_id: info.user.workshopId });
  }, [info.user]);

  const openConcierge = useCallback(() => {
    setConciergeMounted(true);
    setConciergeOpen(true);
  }, []);
  const closeConcierge = useCallback(() => setConciergeOpen(false), []);
  const openClaim = useCallback(() => setClaimOpen(true), []);
  const closeClaim = useCallback(() => setClaimOpen(false), []);
  const markClaimed = useCallback(() => {
    setJustClaimed(true);
    setStampKey((k) => k + 1);
  }, []);

  const claim: ClaimMode = justClaimed ? "owned" : info.claim;

  const value = useMemo<PassportCtx>(
    () => ({
      ...info,
      claim,
      claimOpen,
      openClaim,
      closeClaim,
      justClaimed,
      markClaimed,
      stampKey,
      conciergeOpen,
      openConcierge,
      closeConcierge,
    }),
    [
      info,
      claim,
      claimOpen,
      openClaim,
      closeClaim,
      justClaimed,
      markClaimed,
      stampKey,
      conciergeOpen,
      openConcierge,
      closeConcierge,
    ],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <ClaimDialog />
      {!conciergeOpen && <ConciergeFab onOpen={openConcierge} />}
      {conciergeMounted && (
        <ConciergePanel
          open={conciergeOpen}
          onClose={closeConcierge}
          code={info.code}
          sizeCm={info.sizeCm}
          contactEmail={info.contactEmail}
          claim={claim}
          onClaim={openClaim}
        />
      )}
    </Ctx.Provider>
  );
}
