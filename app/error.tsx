"use client";

import { useEffect, useRef, useState } from "react";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { log } from "@/lib/log";
import { newRequestId } from "@/lib/request-id";

/** Route error boundary. Logs ui.error once per error (a render loop cannot flood app_logs). */
export default function ErrorBoundary({ error, retry }: { error: unknown; retry: () => void }) {
  const logged = useRef<unknown>(null);
  const [requestId] = useState(() => newRequestId());

  useEffect(() => {
    if (logged.current === error) return;
    logged.current = error;
    const digest = (error as { digest?: unknown } | null)?.digest;
    log.error("ui.error", error, {
      request_id: requestId,
      message: error instanceof Error ? error.message : String(error),
      payload: { digest: typeof digest === "string" ? digest : null, path: window.location.pathname },
    });
  }, [error, requestId]);

  return (
    <ErrorCard
      requestId={requestId}
      onRetry={() => retry()}
      secondary={{ href: "/workshop", label: "Go to Workshop" }}
    />
  );
}
