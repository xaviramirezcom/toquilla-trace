import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

const DOC_FILES = ["./README.md", "./HANDOFF.md", "./docs/**/*.md", "./design_handoff_toquilla_trace/README.md"];

// Cache Components is left off on purpose: pages that read the session use
// `export const dynamic = "force-dynamic"` (see docs/FOUNDATION.md).
const nextConfig: NextConfig = {
  // Don't advertise the framework in an X-Powered-By header.
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // /docs renders repo markdown. The pages are static (read at build time); these includes keep
  // the files in the server trace in case a docs page ever renders at request time.
  outputFileTracingIncludes: {
    "/docs": DOC_FILES,
    "/docs/*": DOC_FILES,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        // With NEXT_PUBLIC_SUPABASE_URL set (every deploy), connect-src allows only this project's
        // https and wss origins. The *.supabase.co fallback is only for builds without env (CI).
        headers: securityHeaders({
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          dev: process.env.NODE_ENV !== "production",
        }),
      },
    ];
  },
};

export default nextConfig;
