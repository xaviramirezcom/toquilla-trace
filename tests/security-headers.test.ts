import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";

const URL_ = "https://mflvsnpyckuwhicvgnsr.supabase.co";

describe("security headers", () => {
  it("production CSP allows Supabase https and wss, Google Fonts, and no eval", () => {
    const csp = contentSecurityPolicy({ supabaseUrl: URL_, dev: false });
    expect(csp).toContain(`connect-src 'self' ${URL_} wss://mflvsnpyckuwhicvgnsr.supabase.co`);
    expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(csp).toContain("font-src 'self' data: https://fonts.gstatic.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("development CSP allows eval and websockets for hot reload", () => {
    const csp = contentSecurityPolicy({ supabaseUrl: URL_, dev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("falls back to any Supabase project when the URL is missing or bad", () => {
    expect(contentSecurityPolicy({ supabaseUrl: null })).toContain("https://*.supabase.co wss://*.supabase.co");
    expect(contentSecurityPolicy({ supabaseUrl: "not a url" })).toContain("https://*.supabase.co");
  });

  it("sends HSTS, referrer, nosniff, frame and permissions headers", () => {
    const h = Object.fromEntries(securityHeaders({ supabaseUrl: URL_ }).map((x) => [x.key, x.value]));
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Permissions-Policy"]).toContain("microphone=(self)");
    expect(h["Permissions-Policy"]).toContain("camera=()");
  });
});
