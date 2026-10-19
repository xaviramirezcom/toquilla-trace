"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Dialog, Icon, useToast } from "@/components/ui";
import { log } from "@/lib/log";
import { newRequestId } from "@/lib/request-id";
import { usePassport } from "./PassportProvider";

type ClaimError = "email_unconfirmed" | "not_recipient" | "network" | null;

const ERROR_COPY: Record<Exclude<ClaimError, null>, string> = {
  email_unconfirmed: "Confirm your email first, then try again.",
  not_recipient: "Only the person this hat was transferred to can claim it.",
  network: "Couldn't reach the server. Check your connection and try again.",
};

const linkBase =
  "inline-flex h-11 items-center justify-center rounded-[10px] px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Claim dialogs (spec 06 "Claim dialogs", D11, D21). Rendered once by PassportProvider. */
export function ClaimDialog() {
  const { code, claim, claimOpen, closeClaim, markClaimed } = usePassport();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ClaimError>(null);
  const [forceLogin, setForceLogin] = useState(false);

  const next = encodeURIComponent(`/hat/${code}`);

  function close() {
    if (busy) return;
    setError(null);
    closeClaim();
  }

  async function onClaim() {
    const request_id = newRequestId();
    setBusy(true);
    setError(null);
    try {
      // Loaded on click, so buyers who only read the passport never download supabase-js.
      const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
      const { data, error: rpcError } = await getSupabaseBrowserClient().rpc("claim_hat", {
        p_code: code,
        p_request_id: request_id,
      });
      if (rpcError) throw rpcError;
      const result = (data ?? {}) as { ok?: boolean; result?: string };
      if (result.ok) {
        markClaimed();
        closeClaim();
        toast.success("This hat is now registered to you.");
        router.refresh();
        return;
      }
      if (result.result === "not_authenticated") {
        setForceLogin(true);
      } else if (result.result === "email_unconfirmed") {
        setError("email_unconfirmed");
      } else {
        setError("not_recipient");
        router.refresh();
      }
    } catch (err) {
      log.error("ui.error", err, { request_id, hat_code: code, message: "Claim request failed" });
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  if (claim === "login" || forceLogin) {
    return (
      <Dialog
        open={claimOpen}
        onClose={close}
        title="Log in to claim this hat"
        description="Log in or create an account with the email this hat was transferred to. You'll come back to this passport afterwards."
        footer={
          <>
            <Link href={`/signup?next=${next}`} className={`${linkBase} border border-line bg-surface hover:bg-surface2`}>
              Create account
            </Link>
            <Link
              href={`/login?next=${next}`}
              data-autofocus
              className={`${linkBase} bg-accent text-on-accent hover:bg-accent-strong`}
            >
              Log in
            </Link>
          </>
        }
      />
    );
  }

  if (claim !== "button") return null;

  return (
    <Dialog
      open={claimOpen}
      onClose={close}
      title={`Claim ${code} as yours?`}
      description="This hat was transferred to your email. Claiming registers it to your account; your name is never shown on the public passport."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onClaim} loading={busy} loadingLabel="Claiming..." icon="approval" data-autofocus>
            {error === "network" ? "Retry" : "Claim"}
          </Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-[10px] border border-err bg-err-tint px-3 py-2 text-[13px] font-medium">
          <Icon name="error" size={18} className="mt-px text-err" />
          {ERROR_COPY[error]}
        </p>
      )}
    </Dialog>
  );
}
