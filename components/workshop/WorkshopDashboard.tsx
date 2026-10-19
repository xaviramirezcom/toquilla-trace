"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { Profile } from "@/lib/auth/types";
import { cn } from "@/lib/cn";
import { shouldAutoRecord } from "@/lib/voice/reducer";
import { greeting } from "@/lib/workshop/format";
import type { WorkshopOverview } from "@/lib/workshop/overview";
import { RunBubbles, type LastRun } from "./AgentRun";
import { ComposerCard, ComposerDock, EXAMPLES } from "./Composer";
import { NewHatDialog } from "./NewHatDialog";
import { MobileApproveBar, ProposalPanel } from "./ProposalPanel";
import { FirstRunCard, RecentActivity, TodayTiles } from "./SideColumn";
import { useComposer, type AgentSuccess } from "./useComposer";
import { useProposals } from "./useProposals";

export interface WorkshopDashboardProps {
  profile: Profile;
  overview: WorkshopOverview;
  welcome: boolean;
  hatTag: string | null;
  autoRecord: boolean;
}

export function WorkshopDashboard({ profile, overview, welcome, hatTag, autoRecord }: WorkshopDashboardProps) {
  const isAdmin = profile.role === "admin";
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname() ?? "/workshop";
  const proposals = useProposals(profile.workshopId);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [sentThisSession, setSentThisSession] = useState(false);
  const [newHatOpen, setNewHatOpen] = useState(false);
  const [hour, setHour] = useState<number | null>(null);
  /** Mobile: the voice dock replaces the approve bar while the person records another update. */
  const [dockComposer, setDockComposer] = useState(false);

  const onSuccess = useCallback(
    (r: AgentSuccess) => {
      setLastRun({
        note: r.note,
        inputMode: r.inputMode,
        hatTag: r.hatTag,
        summary: r.response.summary,
        proposals: r.response.proposals.length,
        runId: r.response.run_id,
        meta: r.response.meta ?? null,
        clientMs: r.clientMs,
      });
      setSentThisSession(true);
      proposals.addRun(r.response.proposals);
      setDockComposer(false);
      router.refresh();
    },
    [proposals, router],
  );
  const composer = useComposer(onSuccess);
  const composerRef = useRef(composer);
  useEffect(() => {
    composerRef.current = composer;
  });

  // Greeting uses the viewer's local clock, so it renders after mount.
  useEffect(() => {
    const id = setTimeout(() => setHour(new Date().getHours()), 0);
    return () => clearTimeout(id);
  }, []);

  // Welcome toast once after sign-up, then drop ?welcome=1 from the URL.
  const welcomed = useRef(false);
  useEffect(() => {
    if (!welcome || welcomed.current) return;
    welcomed.current = true;
    toast.success("Welcome to Toquilla Trace!");
    router.replace(pathname);
  }, [welcome, toast, router, pathname]);

  // ?hat=TQ-7F3K2 tags the note; ?record=1 presses the mic once the permission query settles,
  // so the usual permission flow (explainer, blocked hint or recording) runs.
  useEffect(() => {
    if (hatTag) composerRef.current.setHat(hatTag);
  }, [hatTag]);
  const autoStarted = useRef(false);
  const autoRecordNow = shouldAutoRecord({
    requested: autoRecord,
    alreadyStarted: false, // the ref is checked in the effect (refs are not read during render)
    permReady: composer.permReady,
    supported: composer.state.supported,
    phase: composer.state.phase.kind,
  });
  useEffect(() => {
    if (!autoRecordNow || autoStarted.current) return;
    autoStarted.current = true;
    composerRef.current.micClick();
  }, [autoRecordNow]);

  // Keyboard: "/" focuses the composer, Esc cancels a recording.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const inField = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "/" && !inField && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        composerRef.current.focusTextarea();
      } else if (e.key === "Escape" && composerRef.current.state.phase.kind === "recording") {
        composerRef.current.cancel("esc");
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const phase = composer.state.phase.kind;
  const composerBusy = phase !== "idle" || composer.state.note.trim().length > 0;
  const showApproveBar = proposals.openCount > 0 && !dockComposer && !composerBusy;
  const firstRun = overview.hatCount === 0;

  function writeAnother() {
    proposals.clearResolved();
    setLastRun(null);
    composer.focusTextarea();
  }

  function fillExample() {
    composer.edit(EXAMPLES[0].text);
    composer.focusTextarea();
  }

  return (
    <div className="mx-auto w-full max-w-[1240px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.015em] text-ink">Workshop</h1>
          <p className="text-[14px] text-muted" suppressHydrationWarning>
            {hour === null ? `Hello, ${profile.name.split(/\s+/)[0]}` : greeting(hour, profile.name)}
          </p>
        </div>
        <Button variant="secondary" icon="add" onClick={() => setNewHatOpen(true)}>
          New hat manually
        </Button>
      </header>

      <div className="flex flex-wrap gap-6">
        <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-6">
          <div className="hidden md:block">
            <ComposerCard c={composer} isAdmin={isAdmin} />
          </div>
          {lastRun && <RunBubbles run={lastRun} isAdmin={isAdmin} />}
          <ProposalPanel api={proposals} isAdmin={isAdmin} workshopId={profile.workshopId} onWriteAnother={writeAnother} />
        </div>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-6">
          {firstRun ? (
            <FirstRunCard
              hasWeaver={(overview.weaverCount ?? 0) > 0}
              sentNote={sentThisSession || (overview.proposalCount ?? 0) > 0}
              onTryIt={() => {
                setDockComposer(true);
                composer.micClick();
              }}
              onExample={fillExample}
            />
          ) : (
            <>
              <TodayTiles stats={overview.stats} />
              <RecentActivity events={overview.activity} isAdmin={isAdmin} userId={profile.userId} />
            </>
          )}
        </aside>
      </div>

      {/* Mobile: space for the dock, then the dock itself above the 64px tab bar. */}
      <div className={cn("md:hidden", showApproveBar ? "h-24" : "h-56")} aria-hidden />
      <div
        className="fixed inset-x-0 bottom-16 z-20 border-t border-line bg-surface px-4 pt-3 pb-3 shadow-card md:hidden"
        role="region"
        aria-label={showApproveBar ? "Review actions" : "Voice composer"}
      >
        {showApproveBar ? (
          <MobileApproveBar
            api={proposals}
            onMic={() => {
              setDockComposer(true);
              composer.micClick();
            }}
          />
        ) : (
          <ComposerDock
            c={composer}
            isAdmin={isAdmin}
            onClose={proposals.openCount > 0 ? () => setDockComposer(false) : undefined}
          />
        )}
      </div>

      <NewHatDialog open={newHatOpen} onClose={() => setNewHatOpen(false)} workshopId={profile.workshopId} />
    </div>
  );
}
