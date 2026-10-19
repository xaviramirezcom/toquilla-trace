"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { log } from "@/lib/log";

/** Route error boundary. Logs ui.error once per error (a render loop cannot flood app_logs). */
export default function ErrorBoundary({ error, retry }: { error: unknown; retry: () => void }) {
  const logged = useRef<unknown>(null);

  useEffect(() => {
    if (logged.current === error) return;
    logged.current = error;
    const digest = (error as { digest?: unknown } | null)?.digest;
    log.error("ui.error", error, {
      message: error instanceof Error ? error.message : String(error),
      payload: { digest: typeof digest === "string" ? digest : null, path: window.location.pathname },
    });
  }, [error]);

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <EmptyState
        icon="error"
        title="Something went wrong"
        description="This page hit an error. It has been logged. Try again, or go back to the workshop."
        action={
          <div className="flex gap-2">
            <Link
              href="/workshop"
              className="inline-flex h-11 items-center rounded-[10px] border border-line bg-surface px-4 text-sm font-semibold hover:bg-surface2"
            >
              Go to Workshop
            </Link>
            <Button onClick={() => retry()}>Try again</Button>
          </div>
        }
      />
    </main>
  );
}
