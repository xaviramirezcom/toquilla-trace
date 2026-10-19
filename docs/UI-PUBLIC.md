# Public UI: landing, passport, claim, concierge

What is built for the logged-out surfaces (specs 06 and 07, handoff "Public passport", "Who sees Claim", "Buyer concierge", "Landing").

## Files

| Path | What |
|---|---|
| `app/page.tsx` | Landing (server, `force-dynamic` because it reads the session to show **Go to Workshop** instead of **Log in**) |
| `app/hat/[code]/layout.tsx` | Canonical redirect (308) `/hat/tq-9a1m8` and `/hat/TQ9A1M8` to `/hat/TQ-9A1M8`. In the layout so it runs before the `loading.tsx` stream starts |
| `app/hat/[code]/page.tsx` | Passport (server, `force-dynamic`), `generateMetadata`, view logging with `after()` |
| `app/hat/[code]/loading.tsx` | Skeleton certificate, hero and 5 timeline rows |
| `app/hat/[code]/error.tsx` | "Something went wrong" card with Try again, Go home, mono Request ID with copy. Logs `ui.error` once |
| `components/landing/LandingClient.tsx` | Top bar **Verify a hat** (desktop), mobile bottom bar, scroll-to-verify helper |
| `components/passport/*` | `PassportSections` (certificate, hero, specs, story, weaver, ownership, archived banner, flags note), `PassportChrome` (top bar, footer, report mailto), `PassportProvider` (client context: claim and concierge state), `HeroActions` (desktop buttons, mobile bottom bar), `ClaimDialog`, `ShareButton`, `GradeTip`, `Seal`, `CodeInput`, `NotVerified` |
| `components/concierge/*` | `ConciergeFab`, `ConciergePanel` (loaded with `next/dynamic` on first open), `AssistantBubble`, `parts` (pills, chips, typing, composer, rate-limit banner), `askConcierge` (Edge Function call) |
| `lib/passport/*` | Pure helpers: `code` (input formatting, canonical code, via, bot check), `format` (dates, `humanDuration`), `story` (`buildStory`, `certificateStatus`), `ownership` (`ownershipView`, `ownershipChain`), `meta` (`gradeTip`, `passportMeta`), `concierge` (suggestions, pills, answer kind, failure mapping). `server.ts` is server-only (`getPassport`, `logPassportView`) |
| `tests/passport.test.ts`, `tests/concierge-ui.test.ts` | Vitest for all pure helpers (28 tests) |

## Backend calls

| Call | Where | Notes |
|---|---|---|
| `rpc("public_hat_passport", { p_code })` | `lib/passport/server.ts`, React `cache` so metadata and page share one call | Server Supabase client with the user's cookies, so the database computes `viewer`. RPC error throws to `error.tsx` |
| `rpc("log_passport_view", { p_code, p_via, p_is_bot, p_request_id })` | `after()` in the page | Anonymous client (no session). The database decides `passport.view` vs `passport.verify_failed` and sets `workshop_id`. Falls back to `rpc("log_public", { action, level, payload })` if it errors. Never throws |
| `rpc("claim_hat", { p_code, p_request_id })` | `ClaimDialog` (browser client) | `ok` -> stamp replay, toast "This hat is now registered to you.", `router.refresh()`. `email_unconfirmed`, `not_recipient` and network errors show inline in the dialog |
| `functions.invoke("concierge", { body: { code, messages }, headers: { "x-request-id" }, timeout: 25000 })` | `components/concierge/askConcierge.ts` | Reads `{ answer, sources, refused? }`. On error reads the Response status and `error.code`: 429 or `rate_limited` shows the banner; anything else is the error bubble |

## Behaviour notes

- **Code input:** uppercase, letters and digits only, hyphen after `TQ`, max 8. Verify is enabled only when `normalizeCode` + `isValidCode` pass. Unicode dashes and `_` are accepted as hyphens (pre-replaced before `normalizeCode`, which does not handle them). Error "Codes look like TQ-7F3K2." shows after blur or at 8 chars. Pushes `/hat/CODE?via=verify_box` (landing) or `?via=retry` (Not verified).
- **Not verified:** shown for invalid format (no RPC call) and for unknown codes. The code is shown as plain text, uppercased, max 12 chars. No concierge, no bottom bar.
- **Dates** show in Ecuador time (`America/Guayaquil`); a date-only value keeps its calendar day.
- **Ownership line and Claim** follow `ownershipView` (spec 06 table, D21): recipient and logged out see Claim, anyone else sees no button, owner sees "Registered to you". The concierge "Claim this hat" (on a refused change request) follows the same rule.
- **Share:** native share sheet on touch devices; otherwise a menu with Copy link (toast "Link copied.") and Show QR (placeholder dialog, QR images are Cut). The URL is always `{origin}/hat/{CODE}` with no query.
- **Concierge:** desktop FAB opens a 400px right panel with no scrim (the passport stays scrollable). Mobile opens a 92vh sheet with scrim, focus trap, scroll lock and `visualViewport` sizing. 5 starter chips (size chip uses the hat's `size_cm`), then 3 not yet asked. Typing indicator "Checking the record...". Unknown (no sources, not refused) shows **Contact the workshop** mailto. Error bubble "I couldn't answer that. Try again" resends without counting. 8 answered questions or HTTP 429 disables the composer with the banner; New chat resets. 300-char limit, counter after 250. Chat state survives closing and reopening the panel, not reloads.
- **Feedback (Nice):** Helpful / Not helpful toggles and "What was wrong?" call `log.info("concierge.message", { payload: { event: "feedback", helpful, reason } })`. This is stored only for signed-in viewers; for anonymous visitors the logger drops it because `concierge.message` is not in the `log_public` allowlist (D6).
- **Metadata:** title "Verified {Grade} by {weaver} · Toquilla Trace" (or "by a weaver from {village}"), description per spec 06, canonical URL, Open Graph, Twitter card, `robots: noindex, nofollow`. No price, owner or email. No OG image yet (Nice).
- **Privacy:** the page HTML contains no uuid and no email except the workshop `contact_email` (checked with curl on TQ-9A1M8). All record text renders as React text nodes.
- **Motion:** the seal stamp (600ms, `cubic-bezier(.2,1.3,.4,1)`) and the claim stamp are disabled under `prefers-reduced-motion`.

## Verified against the real backend (dev server, logged out)

- `/` renders, Verify box with `tq9a1m8` lands on `/hat/TQ-9A1M8?via=verify_box`.
- `/hat/TQ-9A1M8`: Verified certificate "Recorded by Taller Pillco, Cuenca", "Finished Oct 2, 2026", 5 dated steps, weaver card, "Transferred to a buyer on Oct 10, 2026. Log in to claim it if it's yours.", Claim opens "Log in to claim this hat" with `/login?next=%2Fhat%2FTQ-9A1M8`.
- `/hat/tq-9a1m8` and `/hat/TQ9A1M8` return 308 to `/hat/TQ-9A1M8`. `/hat/TQ-ZZZZZ` and `/hat/TQ-9A1M` render Not verified.
- `log_passport_view` returns no error as anon. `claim_hat` is denied to anon (expected).
- Not verified yet: the logged-in recipient claim (needs a browser sign-in) and real concierge answers (function not deployed when this was written; the error bubble path was exercised).

## Open items for other owners

- `concierge` Edge Function: must answer CORS preflight for `http://localhost:*` and the Vercel origin, and allow the `x-request-id`, `authorization`, `apikey`, `content-type` and `x-client-info` headers.
- `domain.ts` `normalizeCode` does not map Unicode dashes (spec 06 step 2). The UI pre-replaces them; the domain owner may want to add it.
- Seed: TQ-9A1M8 is `owner_type = 'buyer'` with a pending `transfer_email`, so the ownership chain highlights Buyer before the claim. Spec 06 lines still read correctly.
- Footer "About" and "Privacy" are placeholder anchors (no pages exist). "Report a problem" is a mailto to the workshop contact, or a subject-only mailto on Not verified.
