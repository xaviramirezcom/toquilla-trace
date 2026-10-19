import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@domain\/(.*)$/, replacement: `${root}supabase/functions/_shared/$1` },
      { find: /^@\/(.*)$/, replacement: `${root}$1` },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
