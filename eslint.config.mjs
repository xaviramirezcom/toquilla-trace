import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "design_handoff_toquilla_trace/**",
    // Deno code is checked by Deno (deno check + deno lint in CI), not by the Next.js lint. The
    // shared files that Node code and tests import (zero npm imports) are linted here too.
    "supabase/functions/*",
    "!supabase/functions/_shared/",
    "supabase/functions/_shared/*",
    "!supabase/functions/_shared/domain.ts",
    "!supabase/functions/_shared/log-format.ts",
    "!supabase/functions/_shared/pricing.ts",
    "!supabase/functions/_shared/tools.ts",
    "!supabase/functions/_shared/agent.ts",
    "!supabase/functions/_shared/apply.ts",
    "!supabase/functions/_shared/concierge.ts",
    "!supabase/functions/_shared/llm-types.ts",
  ]),
]);

export default eslintConfig;
