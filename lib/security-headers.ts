// Security headers for every route (docs/SECURITY.md). Pure, so next.config.ts and tests share it.
// Next.js inlines small bootstrap scripts and the theme init script without a nonce, so
// script-src needs 'unsafe-inline'. 'unsafe-eval' is only added in development (React refresh).

export interface SecurityHeaderOptions {
  supabaseUrl?: string | null;
  dev?: boolean;
}

function supabaseOrigins(url: string | null | undefined): string[] {
  if (!url) return ["https://*.supabase.co", "wss://*.supabase.co"];
  try {
    const u = new URL(url);
    const wss = `${u.protocol === "http:" ? "ws:" : "wss:"}//${u.host}`;
    return [u.origin, wss];
  } catch {
    return ["https://*.supabase.co", "wss://*.supabase.co"];
  }
}

export function contentSecurityPolicy({ supabaseUrl, dev = false }: SecurityHeaderOptions = {}): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:", "blob:"],
    "connect-src": ["'self'", ...supabaseOrigins(supabaseUrl), ...(dev ? ["ws:"] : [])],
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'", "blob:"],
    "frame-ancestors": ["'none'"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function securityHeaders(opts: SecurityHeaderOptions = {}): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(opts) },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=()" },
  ];
}
