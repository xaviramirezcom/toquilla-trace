"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/shell/Logo";
import { Button } from "./Button";
import { Icon } from "./Icon";

export interface ErrorCardProps {
  requestId: string;
  onRetry: () => void;
  /** The second button: "Go to Workshop" in the app, "Go home" on the public passport. */
  secondary: { href: string; label: string };
}

/**
 * Handoff "Page error": Try again, a way out, and a copyable request id that matches the ui.error log
 * row, so a member can share it with support and an admin can find the row in Logs.
 */
export function ErrorCard({ requestId, onRetry, secondary }: ErrorCardProps) {
  const [copied, setCopied] = useState(false);

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
            <Button onClick={onRetry}>Try again</Button>
            <Link
              href={secondary.href}
              className="inline-flex h-11 items-center rounded-[10px] border border-line bg-surface px-4 text-sm font-semibold hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {secondary.label}
            </Link>
          </div>
          <div className="flex items-center gap-1 text-[13px] text-muted">
            <span className="font-mono break-all">Request ID: {requestId}</span>
            <button
              type="button"
              onClick={copy}
              aria-label={copied ? "Copied!" : "Copy request ID"}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-[8px] hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Icon name={copied ? "check" : "content_copy"} size={16} />
            </button>
            <span role="status" className="sr-only">
              {copied ? "Copied!" : ""}
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}
