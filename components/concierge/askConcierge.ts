"use client";

import { log } from "@/lib/log";
import { CLIENT_TIMEOUT_MS, classifyFailure, parseAnswer } from "@/lib/passport/concierge";
import type { ChatTurn, ConciergeAnswer } from "@/lib/passport/types";
import { newRequestId } from "@/lib/request-id";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type ConciergeResult =
  | { ok: true; answer: ConciergeAnswer }
  | { ok: false; failure: "rate_limited" | "error"; code: string | null; requestId: string };

/**
 * Calls the concierge Edge Function (conventions section 4):
 * invoke('concierge', { body: { code, messages }, headers: { 'x-request-id' } }) -> { answer, sources, refused? }.
 * Errors come back as { error: { code, message, request_id } }; HTTP 429 or code rate_limited means rate limited.
 */
export async function askConcierge(code: string, messages: ChatTurn[]): Promise<ConciergeResult> {
  const requestId = newRequestId();
  try {
    const { data, error } = await getSupabaseBrowserClient().functions.invoke("concierge", {
      body: { code, messages },
      headers: { "x-request-id": requestId },
      timeout: CLIENT_TIMEOUT_MS,
    });
    if (error) {
      let status: number | null = null;
      let errCode: string | null = null;
      const ctx = (error as { context?: unknown }).context;
      if (ctx instanceof Response) {
        status = ctx.status;
        try {
          const body = (await ctx.clone().json()) as { error?: { code?: string } };
          errCode = body?.error?.code ?? null;
        } catch {
          // Non-JSON body (gateway error page).
        }
      }
      return { ok: false, failure: classifyFailure(status, errCode), code: errCode, requestId };
    }
    const answer = parseAnswer(data);
    if (!answer) {
      log.warn("concierge.error", { request_id: requestId, hat_code: code, payload: { code: "bad_response" } });
      return { ok: false, failure: "error", code: "bad_response", requestId };
    }
    return { ok: true, answer };
  } catch {
    return { ok: false, failure: "error", code: "network", requestId };
  }
}
