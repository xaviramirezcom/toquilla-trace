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
    // Deno code is checked by Deno, not by the Next.js lint. The pure shared
    // files (zero imports) are linted because Node code imports them.
    "supabase/functions/*",
    "!supabase/functions/_shared/",
    "supabase/functions/_shared/*",
    "!supabase/functions/_shared/domain.ts",
    "!supabase/functions/_shared/log-format.ts",
    "!supabase/functions/_shared/pricing.ts",
    "!supabase/functions/_shared/tools.ts",
  ]),
]);

export default eslintConfig;
