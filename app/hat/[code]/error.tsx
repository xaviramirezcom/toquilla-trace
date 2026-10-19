"use client";

import { useEffect, useRef, useState } from "react";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { log } from "@/lib/log";
import { newRequestId } from "@/lib/request-id";

/** Passport "Page error" card (handoff "Other pages"). Logs ui.error once with a request id. */
export default function PassportError({ error, retry }: { error: unknown; retry: () => void }) {
  const logged = useRef<unknown>(null);
  const [requestId] = useState(() => newRequestId());

  useEffect(() => {
    if (logged.current === error) return;
    logged.current = error;
    // pathname keeps the code percent-encoded; slice the raw segment so a bad escape can't throw here.
    const m = /^\/hat\/([A-Za-z0-9-]{1,12})/.exec(window.location.pathname);
    log.error("ui.error", error, {
      request_id: requestId,
      hat_code: m ? m[1].toUpperCase() : undefined,
      message: "Passport page error",
      payload: { path: "/hat/[code]" },
    });
  }, [error, requestId]);

  // Buyers on a public passport have no workshop, so the way out is the landing page.
  return <ErrorCard requestId={requestId} onRetry={() => retry()} secondary={{ href: "/", label: "Go home" }} />;
}
