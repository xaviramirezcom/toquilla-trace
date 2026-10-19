import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseEnv, requireSupabaseEnv } from "@/lib/env";

/**
 * Server Supabase client for Server Components, Server Actions and Route Handlers.
 * Uses the user's auth cookies, so RLS applies as that user. Create one per request.
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient> {
  const { url, anonKey } = requireSupabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy refreshes the session.
        }
      },
    },
  });
}

/** Null when Supabase env vars are missing (lets pages render a "not configured" state at build time). */
export async function tryGetSupabaseServerClient(): Promise<SupabaseClient | null> {
  return getSupabaseEnv() ? getSupabaseServerClient() : null;
}
