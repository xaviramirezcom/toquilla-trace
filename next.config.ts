import type { NextConfig } from "next";

// Cache Components is left off on purpose: pages that read the session use
// `export const dynamic = "force-dynamic"` (see docs/FOUNDATION.md).
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
