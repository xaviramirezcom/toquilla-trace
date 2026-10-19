"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/shell/Logo";
import { Button, Icon } from "@/components/ui";
import { log } from "@/lib/log";
import { newRequestId } from "@/lib/request-id";

/** Passport "Page error" card (handoff "Other pages"). Logs ui.error once with a request id. */
export default function PassportError({ error, retry }: { error: unknown; retry: () => void }) {
  const logged = useRef<unknown>(null);
  const [requestId] = useState(() => newRequestId());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (logged.current === error) return;
    logged.current = error;
    const m = /^\/hat\/([^/?#]{1,12})/.exec(window.location.pathname);
    log.error("ui.error", error, {
      request_id: requestId,
      hat_code: m ? decodeURIComponent(m[1]).toUpperCase().slice(0, 12) : undefined,
      message: "Passport page error",
      payload: { path: "/hat/[code]" },
    });
  }, [error, requestId]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(requestId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the id is still visible to copy by hand.
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center border-b border-line px-4 md:px-8">
        <Logo href="/" />
      </header>
      <main className="mx-auto flex w-full max-w-[520px] flex-1 flex-col px-4 py-16">
        <section className="flex flex-col gap-4 rounded-[18px] border border-line bg-surface p-6">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-err-tint text-err">
            <Icon name="error" size={24} />
          </span>
          <h1 className="font-serif text-[28px] leading-tight font-medium">Something went wrong</h1>
          <p className="text-muted">We couldn&apos;t load this page. The error was saved to the log.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => retry()}>Try again</Button>
            <Link
              href="/"
              className="inline-flex h-11 items-center rounded-[10px] border border-line bg-surface px-4 text-sm font-semibold hover:bg-surface2"
            >
              Go home
            </Link>
          </div>
          <div className="flex items-center gap-2 text-[13px] text-muted">
            <span className="font-mono">Request ID: {requestId}</span>
            <button
              type="button"
              onClick={copy}
              aria-label={copied ? "Copied!" : "Copy request ID"}
              className="grid h-8 w-8 place-items-center rounded-[8px] hover:bg-surface2"
            >
              <Icon name={copied ? "check" : "content_copy"} size={16} />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
