import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import { getSupabaseEnv } from "@/lib/env";
import { newRequestId } from "@/lib/request-id";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Via } from "./code";
import type { Passport } from "./types";

/**
 * One public_hat_passport call per request, shared by generateMetadata and the page (React cache).
 * Uses the user's session when there is one, so the database can compute `viewer`.
 * Throws on an RPC error (the route error boundary shows the Page error card).
 */
export const getPassport = cache(async (code: string): Promise<Passport | null> => {
  if (!getSupabaseEnv()) throw new Error("Supabase is not configured");
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("public_hat_passport", { p_code: code });
  if (error) throw new Error(`public_hat_passport failed: ${error.message}`);
  return (data as Passport | null) ?? null;
});

export interface ViewLog {
  code: string;
  found: boolean;
  via: Via;
  isBot: boolean;
  reason: "invalid_format" | "not_found" | null;
}

/**
 * passport.view / passport.verify_failed through log_public (D6). Anonymous on purpose:
 * no user id, IP, user agent or email. Never throws: logging must not change what the page renders.
 */
export async function logPassportView(v: ViewLog): Promise<void> {
  try {
    const env = getSupabaseEnv();
    if (!env) return;
    const client = createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const hat_code = v.code.replace(/[^A-Z0-9-]/g, "").slice(0, 12);
    const request_id = newRequestId();
    // Preferred: log_passport_view (spec 06). The database decides found/not found and sets workshop_id.
    const primary = await client.rpc("log_passport_view", {
      p_code: hat_code,
      p_via: v.via,
      p_is_bot: v.isBot,
      p_request_id: request_id,
    });
    if (!primary.error) return;
    // Fallback: the generic anonymous logger (D6 allowlist).
    await client.rpc("log_public", {
      action: v.found ? "passport.view" : "passport.verify_failed",
      level: v.found ? "info" : "warn",
      payload: {
        hat_code,
        via: v.via,
        is_bot: v.isBot,
        reason: v.reason,
        request_id,
        message: v.found ? "Passport viewed" : "Code not in records",
      },
    });
  } catch {
    // Swallowed on purpose.
  }
}
