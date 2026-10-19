// Public Supabase settings (D24). Read lazily so `next build` works with no env vars set.
// Next.js inlines NEXT_PUBLIC_* at build time only for direct `process.env.NAME` reads.

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

/** Returns null when the app is not configured (for example in CI builds). */
export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function requireSupabaseEnv(): SupabaseEnv {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).",
    );
  }
  return env;
}
