"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv, requireSupabaseEnv } from "@/lib/env";

let browserClient: SupabaseClient | null = null;

/** Browser Supabase client (anon key, RLS applies). One instance per tab. Throws if env is missing. */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    const { url, anonKey } = requireSupabaseEnv();
    browserClient = createBrowserClient(url, anonKey);
  }
  return browserClient;
}

/** Same as above but returns null instead of throwing (used by the logger, which must never throw). */
export function tryGetSupabaseBrowserClient(): SupabaseClient | null {
  if (browserClient) return browserClient;
  return getSupabaseEnv() ? getSupabaseBrowserClient() : null;
}
