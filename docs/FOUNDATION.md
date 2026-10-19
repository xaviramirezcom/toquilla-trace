# Foundation guide (read before building a feature)

What the scaffold gives you, how to use it, and where it differs from the specs. Specs still rule; decisions D1 to D26 in `docs/specs/00-conventions.md` override everything.

## Versions (pinned exactly in `package.json`)

Next.js 16.4.2, React 19.3.0, TypeScript 5.9.3, Tailwind CSS 4.3.3 (`@tailwindcss/turbopack`), ESLint 9.39.5 + `eslint-config-next` 16.4.2, `@supabase/supabase-js` 2.118.0, `@supabase/ssr` 0.12.7, `zod` 4.6.7, `server-only` 0.0.1, Vitest 4.1.12, tsx 4.23.15, Prettier 3.9.10, `@types/node` 20.19.43. Node 20.9+ (CI uses Node 20, which is why Vitest is 4.x and not 5.x).

**Next.js 16 notes:** `middleware.ts` is now `proxy.ts` (export `proxy`). Route `params` and `searchParams` are Promises (`const { code } = await params`). `error.tsx` receives `{ error: unknown, retry }`. Cache Components is **off**, so the classic model applies: use `export const dynamic = "force-dynamic"` on anything that reads cookies. Read `node_modules/next/dist/docs/` before using an unfamiliar API.

## File map

| Path | What it is |
|---|---|
| `app/layout.tsx` | Root: fonts, theme init script, icon font link, `<ToastProvider>` |
| `app/globals.css` | Design tokens (light, dark, system), Tailwind theme, `woven` utility, animations |
| `app/(app)/layout.tsx` | Signed-in shell: loads `getProfile()`, redirects to `/login` if null, wraps in `AppShell` |
| `app/(app)/{workshop,hats,hats/[code],weavers,runs,runs/[id],logs,settings}/page.tsx` | Placeholders. Replace the page body |
| `app/page.tsx`, `app/login`, `app/signup`, `app/hat/[code]` | Public placeholders (no shell) |
| `app/error.tsx`, `app/not-found.tsx` | Error boundary (logs `ui.error` once) and 404 |
| `proxy.ts` | Refreshes the Supabase session; redirects signed-out users on protected routes to `/login?next=...` |
| `components/ui/*` | Base components (barrel: `@/components/ui`) |
| `components/shell/*` | `AppShell`, `UserMenu`, `Avatar`, `Logo`, nav config |
| `components/feedback/ComingSoon.tsx` | Placeholder body (delete when unused) |
| `lib/env.ts` | Lazy env reads (`getSupabaseEnv()` returns null when unset) |
| `lib/supabase/client.ts` | Browser client: `getSupabaseBrowserClient()`, `tryGetSupabaseBrowserClient()` |
| `lib/supabase/server.ts` | Server client: `await getSupabaseServerClient()` (server components, actions, route handlers) |
| `lib/auth/role.ts`, `lib/auth/types.ts` | `getProfile()`, `isAdmin()`, `Profile`, `Role` |
| `lib/log.ts` | Client logger `log` (and `createLogger` for tests) |
| `lib/request-id.ts` | `newRequestId()`, `REQUEST_ID_RE` |
| `lib/safe-next.ts`, `lib/routes.ts` | `safeNext(next)`, `PROTECTED_PREFIXES`, `isProtectedPath()` |
| `lib/theme.ts`, `lib/cn.ts` | Theme preference helpers, class name joiner |
| `supabase/functions/_shared/domain.ts` | All business rules (spec 05). Zero imports |
| `supabase/functions/_shared/log-format.ts` | `LogAction` union, `LogRow`, `redact`, `serializeError`, `maskEmail`, `buildDebugPrompt`, `capPayload` |
| `supabase/functions/_shared/pricing.ts` | Gemini prices (D26), `costUsd`, `usageFromGemini`, `formatUsd`, `DEFAULT_MODEL` |
| `supabase/config.toml` | From `supabase init` (offline). `[functions.concierge] verify_jwt = false` already set |
| `tests/*.test.ts` | domain (all 87 spec cases), log-format, pricing, logger, safeNext, request id |
| `evals/run.ts`, `scripts/logs.ts` | Placeholders that print "not implemented yet" |

Not created yet (owned by feature agents): `supabase/migrations/0001_init.sql`, `supabase/seed.sql`, `_shared/{http,log,llm,tools}.ts`, Edge Functions.

## Imports and aliases

- `@/...` is the repo root: `import { Button } from "@/components/ui"`.
- `@domain/...` is `supabase/functions/_shared/`: `import { canAdvance } from "@domain/domain"`.
- Deno code imports the same files relatively with the extension: `import { canAdvance } from "./domain.ts"`.
- `tsconfig.json` excludes `supabase/functions` from the root set, so Deno files (`npm:` imports) are never type checked by Next. Files reached through `@domain/*` are still checked, so **anything imported via `@domain` must have zero imports** (or only relative imports of other zero-import files). `allowImportingTsExtensions` is on for that reason.
- ESLint ignores `supabase/functions/**` except `_shared/{domain,log-format,pricing,tools}.ts`.
- Vitest uses `vitest.config.mts` with the same two aliases and runs `tests/**/*.test.ts` in Node.

## Domain rules (`@domain/domain`)

Everything from spec 05 with the exact signatures and messages: `STAGES`, `GRADES`, `GRADE_RANGES`, `ROWS_MIN/MAX`, `HAT_CODE_RE`, `CODE_ALPHABET`, `STRAWS`, `MIN_WEAVING_DAYS`, `NEW_HAT_STAGE` (0, D15), `stageName`, `stageIndex`, `nextStage`, `isOwner`, `canAdvance`, `gradeFor`, `gradeMismatch`, `gradeMismatchMessage`, `validateRows`, `isValidCode`, `normalizeCode`, `canonicalCode`, `matchCode`, `generateCode`, `foldText`, `quoteInNote`, `matchWeavers`, `minWeavingDays`, `weavingDays`, `detectAnomalies`, `canTransfer`, `canClaim`, `validateHatFields`, plus the types `HatLike`, `HatEventLike`, `Actor`, `RuleResult`, `RuleCode`, `Anomaly`, `CodeMatch`.

Functions take only the hat fields they need (`Pick<HatLike, ...>`), so you can pass a full DB row. Functions that need the time take `now` as an ISO string. Grade vs rows is checked in code only, never in SQL (D10).

## Components (`@/components/ui`)

| Component | Props |
|---|---|
| `Button` | `variant?: "primary" \| "secondary" \| "ghost" \| "destructive"`, `size?: "sm" \| "md" \| "lg" \| "icon"` (36 / 44 / 52 / 44 square), `loading?`, `loadingLabel?` (e.g. "Approving…"), `icon?` (symbol name), `fullWidth?`, plus all `<button>` props. Loading keeps the width, shows a spinner and disables. Default `type="button"` |
| `Badge` | `tone?: "neutral" \| "accent" \| "ok" \| "warn" \| "err" \| "info"`, `icon?`, `pill?`, `children` |
| `Card` | `padding?: "none" \| "sm" \| "md" \| "lg"`, `elevated?`, plus `<div>` props |
| `Input`, `Textarea` | `label` (required, always visible), `error?`, `hint?`, `mono?`, plus native props. Sets `aria-invalid` and `aria-describedby`. Client components |
| `Dialog` | `open`, `onClose`, `title`, `description?`, `children?`, `footer?` (secondary first, primary last), `dismissible?` (false = destructive confirm: no ×, Esc or backdrop), `size?: "default" \| "wide"` (520 / 560). Bottom sheet with drag handle under 768px, focus trap, restores focus, locks scroll. Put `data-autofocus` on the element to focus first |
| `ToastProvider`, `useToast()` | Mounted in the root layout. `const toast = useToast()` then `toast.success(msg)`, `toast.info`, `toast.warning`, `toast.error(msg, { action: { label, onClick } })`, `toast.show({ kind, message, action?, durationMs? })`, `toast.dismiss(id)`. Each returns an id |
| `toast.undo(msg, { onUndo, onExpire?, durationMs? })` | 10 s with Undo and a countdown bar. `onUndo` when pressed; `onExpire` when time runs out, when closed with ×, or when pushed out by a 4th toast. It does not pause on hover (so the D14 send timer stays exact). Other toasts last 5 s and pause on hover. Max 3 stacked, top center on mobile, bottom right on desktop |
| `Icon` | `name` (Material Symbols Rounded ligature), `size?` (default 20), `filled?`, `label?` (only when the icon stands alone) |
| `Spinner` | `size?`, `label?` |
| `Skeleton` | `className` to size it |
| `EmptyState` | `icon?`, `title`, `description?`, `action?` (woven frame around the icon) |

Shell (`@/components/shell/AppShell`): `AppShell({ profile, pendingCount?, hasRecentErrors?, children })`. The `(app)` layout passes `profile` only. To show the Workshop count badge or the Logs red dot, load the numbers in `app/(app)/layout.tsx` and pass them in. `AppShell` also calls `log.setContext()` with the profile, and handles logout (logs `auth.logout`, flushes, signs out, goes to `/login`; asks first when `pendingCount > 0`). Nav lists live in `components/shell/nav.ts`.

**Styling:** use token utilities: `bg-bg`, `bg-surface`, `bg-surface2`, `border-line`, `text-ink`, `text-muted`, `bg-accent`, `hover:bg-accent-strong`, `bg-accent-tint`, `text-on-accent`, `text-ok` / `bg-ok-tint`, `warn`, `err`, `info`, `bg-straw`, `bg-cream`, `bg-code` / `text-code-text`, `bg-scrim`, `shadow-card`. Fonts: `font-sans` (default), `font-serif`, `font-mono`. Texture: `woven` (certificate border, empty states, hero edge; never behind text) and `woven-logo`. Motion: `animate-enter`, `animate-sheet`, `animate-shimmer` (all disabled under reduced motion). JSON colours are CSS vars `--json-key`, `--json-string`, `--json-number`, `--json-bool`. AI visual language example: proposed = `border-[1.5px] border-dashed border-accent bg-accent-tint`.

**Theme:** `localStorage["tt-theme"]` = `light` or `dark`; absent means system. `applyTheme(pref)` from `@/lib/theme`. The user menu has the Light / Dark / System switch.

## Supabase clients

- Browser: `getSupabaseBrowserClient()` (throws if env is missing) or `tryGetSupabaseBrowserClient()` (returns null).
- Server: `const supabase = await getSupabaseServerClient()` inside the request (never at module top level). `tryGetSupabaseServerClient()` returns null when unconfigured.
- `next build` must pass with no env vars: never read env or create a client at import time, and mark pages that read data `export const dynamic = "force-dynamic"`.
- No service role key anywhere in the web app (D6, D24).

## Auth: `getProfile()`

`import { getProfile } from "@/lib/auth/role"` (server only, cached per request). Returns `{ userId, email, name, workshopId, workshopName, workshopCity, role }` or `null` (signed out, unconfigured or error). It selects `profiles(id, name, role, workshop_id, workshops(name, city))` for the current user, so the migration must keep those column names and the `profiles.workshop_id -> workshops.id` foreign key. If the profile row is missing it returns a `member` with no workshop. Role is for display; RLS is the real check. `isAdmin()` is a shortcut.

`safeNext(next)` from `@/lib/safe-next`: use it on the login page before redirecting (`router.replace(safeNext(searchParams.next))`). It only allows same-site paths and falls back to `/workshop`.

## Logging

```ts
import { log } from "@/lib/log";
import { newRequestId } from "@/lib/request-id";

const request_id = newRequestId();                 // one per user action, in the click handler
log.info("proposal.approve", { request_id, hat_code: "TQ-7F3K2", payload: { proposal_id } });
log.error("proposal.apply_failed", err, { request_id, message: "Approve failed" });
await fetch(url, { headers: { "x-request-id": request_id } });
```

- Actions are the typed `LogAction` union (conventions section 6). A typo is a type error.
- Batches (10 rows or 2 s), flushes on `pagehide` and hidden tab, retries once after 1 s, then drops. Never throws, never await it in a user flow (only `await log.flush()` before logout).
- Payloads go through `redact()` and the 32 KB cap. Never put raw emails in payloads; use `maskEmail()`.
- Signed in: `insert` into `app_logs` without `.select()`. Signed out: only `auth.login_failed`, `auth.signup`, `passport.view`, `passport.verify_failed`, `ui.error` are sent through `rpc("log_public", { action, level, payload })` (message, request_id and error are put inside `payload`). **The migration must define `log_public(action text, level text, payload jsonb)` with exactly these parameter names** (D6). Other anonymous rows are dropped.
- Context comes from `AppShell`. On the login page after sign-in, call `log.setContext({ user_id, workshop_id })` yourself before logging `auth.login`.

## Deviations from the specs

1. **`proxy.ts` instead of `middleware.ts`** (Next.js 16 rename, same behaviour).
2. **Vitest 4.1.12, not latest 5.x**, because Vitest 5 needs Node 22 and CI runs Node 20. Config file is `vitest.config.mts` (ESM).
3. **Cache Components off.** Next 16's template enables it; the specs assume `force-dynamic`, so it is disabled in `next.config.ts`.
4. **Pricing follows D26 (Gemini):** $0.10 / $0.40 per million input / output tokens, no cache prices. Cached tokens are already inside `promptTokenCount` and are billed at the full input price (an overestimate). Thinking tokens count as output. Verify prices on the Gemini pricing page.
5. **`getProfile()` returns more than spec'd:** also `email`, `workshopName`, `workshopCity` for the user menu.
6. **`log_public` signature** uses D6's `(action, level, payload)`, not spec 09's older `(action, message, payload, request_id)`.
7. **`redact()`** also removes Google API keys (`AIza...`) besides JWTs and `sk-ant-` keys.
8. **Debug prompt** says "Gemini API" instead of "Claude API" (D26).
9. **Transfer and claim messages** for `archived` and transfer `not_owner` are not given in spec 05: they read "Archived hats can't be transferred.", "Archived hats can't be claimed." and "Only the current owner can transfer this hat."
10. **Material Symbols** loads as a `<link>` in the root layout with `display=block` (an icon font that `next/font` does not ship; Tailwind drops remote `@import` from CSS). The URL is a constant, which is why the Pages Router font lint rules do not flag it.
11. **"Woven in 1 days."** is kept as spec 05 test 74 says (open question 5).
12. Sidebar collapse (72px), Help item and keyboard shortcuts from the handoff are not in the shell yet.
