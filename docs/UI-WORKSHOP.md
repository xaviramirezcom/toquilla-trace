# Workshop UI and auth pages

> **Build notes written during implementation; may be outdated.** Current design: [ARCHITECTURE.md](ARCHITECTURE.md). Current status: [HANDOFF.md](../HANDOFF.md).

What the `/login`, `/signup`, `/forgot` and `/workshop` screens are made of, where their state lives, and what is wired to the real backend. Specs: `docs/specs/01`, `02`, `04` and the handoff README.

## Files

| Path | What it is |
|---|---|
| `app/login/page.tsx`, `app/signup/page.tsx`, `app/forgot/page.tsx` | Server pages. Login and signup redirect signed-in users (login honours `?next=` through `safeNext`) |
| `components/auth/rules.ts` | Pure: `validateLogin`, `validateSignup`, `mapAuthError`, `authErrorCopy`, `CITIES`, `emailDomain` |
| `components/auth/{LoginForm,SignupForm,ForgotForm}.tsx` | Client forms calling the server actions. Inline errors after the first submit, banners, Retry, 60 s lock on rate limit, password cleared and focused on wrong credentials |
| `components/auth/AuthParts.tsx`, `AuthShell.tsx` | Banner, password field with eye toggle, submit button that becomes a bottom bar on mobile, 420px card layout |
| `lib/auth/actions.ts` | Server actions `login`, `signup`, `requestPasswordReset`, `logout` |
| `app/(app)/workshop/page.tsx` | Server page: profile, Today stats, recent activity, first-run counts; reads `?welcome=1`, `?hat=`, `?record=1` |
| `lib/workshop/overview.ts` | Server-only reads (RLS, filtered to the user's own workshop). Each part is `null` on error so the page still renders |
| `components/workshop/WorkshopDashboard.tsx` | Client root: header, two-column layout, mobile dock, welcome toast, `/` and `Esc` shortcuts |
| `lib/voice/reducer.ts` | Pure composer state machine: `transition(state, event) -> { state, effects }`, copy, limits, `buildAgentRequest` |
| `lib/voice/words.ts` | Pure: `toWords`, `isLikelyCode`, `lowWordsOf`, `lowWordsInNote` |
| `lib/voice/useSpeechRecognition.ts` | Web Speech wrapper (`es-EC`/`en-US`, continuous, interim results) and `useMicPermission` |
| `components/workshop/useComposer.ts` | Runs the machine and its effects (recognizer, 250 ms clock, step timers, agent call, toasts, logs) |
| `components/workshop/Composer.tsx` | `ComposerCard` (desktop) and `ComposerDock` (mobile) from one state |
| `components/workshop/MicButton.tsx` | 72px mic: touch hold / tap, slide to cancel, mouse and keyboard toggle |
| `components/workshop/VoiceBits.tsx`, `AgentRun.tsx`, `ReferenceCopy.tsx` | Notices, waveform, live transcript, unsure chips, agent steps, failed card, You said / Assistant bubbles and meta row |
| `lib/workshop/proposals.ts` | Pure card logic: `fromRow`, `cardView` (8 states), `approveAllSelection`, `rejectAllSelection`, `mergeRun`, `applyResult`, `answerChoice`, `applyFix`, `editsForSubmit` (whitelist), `checkDraft` (domain.ts validation), completion and toast copy |
| `lib/workshop/queue.ts` | Pure D14 undo queue: `enqueue`, `cancel`, `takeDue`, `takeIds` |
| `lib/workshop/api.ts` | Browser calls: `workshop-agent`, `apply-proposals` (plus a keepalive `fetch` for page hide), `restore_proposal`, open proposals, hat version, weavers |
| `lib/workshop/format.ts` | Greeting, relative time, meta row text, activity text |
| `components/workshop/useProposals.ts` | Card list, decision queue, commits, reject, restore, edit, answer, fix, retry |
| `components/workshop/{ProposalPanel,ProposalCard,ProposalEditForm}.tsx` | Panel header and legend, cards, edit forms, completion card, empty state, mobile approve bar |
| `components/workshop/SideColumn.tsx` | Today tiles, Recent activity, first-run card |
| `components/workshop/NewHatDialog.tsx` | "+ New hat manually" dialog (`create_hat` RPC) |
| `tests/auth.test.ts`, `tests/voice.test.ts`, `tests/workshop.test.ts` | Unit tests for everything pure above |

## Auth flows

- **Log in:** `login()` signs in with the cookie client, so the session cookie exists before the browser navigates. Success logs `auth.login` as the user (`app_logs` insert, payload `{ next }`, `duration_ms`). Failure logs `auth.login_failed` through `log_public` with `{ error_code, email_domain, email_hash }` (first 12 hex of SHA-256, never the address). The client then `router.replace(safeNext(next))`.
- **Sign up:** sends `name`, `workshop_name`, `city` as user metadata; the DB trigger creates the workshop and a `member` profile. With a session it logs `auth.signup` and goes to `/workshop?welcome=1` (toast "Welcome to Toquilla Trace!", then the param is removed). With email confirmation on (D11) there is no session, so the form shows "Check your email to confirm your account" instead. An existing email (error, or a user with no identities) shows "This email already has an account. Log in instead?". Failed sign-ups log through `log_public`; a successful sign-up waiting for confirmation is not logged, because `log_public` only accepts failures.
- **Forgot:** `resetPasswordForEmail` and always "If an account exists for that email, we sent a reset link." (no account probing). There is no `/auth/callback` reset page yet, so the link uses the Supabase default flow.
- **Log out:** the shell already logs out in the browser (`AppShell.logout`). `lib/auth/actions.ts` also exports a `logout` server action (logs `auth.logout`, signs out, redirects to `/login`) for anyone who prefers a form action. Nothing calls it today.

## Composer state

States: `idle`, `explaining`, `blocked`, `silence`, `recording{hold|tap}`, `review{lowWords, lost}`, `sending{step}`, `failed`. `supported`, `perm`, `lang`, `typing`, `hatTag`, `usedVoice` sit next to the phase. The reducer never touches the browser; it returns effects (`start`, `stop`, `abort`, `send`, `abortRequest`, `toast`, `log`, `focusTextarea`, `setExplained`, `persistLang`) that `useComposer` runs synchronously in the same event handler, so `recognition.start()` stays inside the user gesture (iOS).

Implemented rules: never auto-send; hold under 350 ms becomes tap; slide left 110 px cancels (hint turns red at 60 px); 2:00 cap with amber timer from 1:50; 8 s without a result is silence; zero words is silence; `network` and unknown recognizer errors keep the words in review with "Voice input stopped..."; `not-allowed` and `audio-capture` show the blocked notice; `service-not-allowed` hides the mic; confidence in (0, 0.6) or code-like tokens are low (wavy amber underline, tooltip, unsure chips that select the word); language toggle disabled while recording or sending and kept in `tt-voice-lang`; first-use notice until `tt-mic-explained`; 1000-char limit with a counter (warn above 900, err above 1000); Cmd/Ctrl+Enter sends; `/` focuses the note; Esc cancels a recording.

Agent progress follows D13: four generic steps at 0, 1.2, 2.4 and 3.6 s; a step is checked only when the next starts, and the last spins until the response. Stop aborts the request (toast "Stopped. Nothing was saved.", `agent.run.end {status: "stopped"}`). Requests time out after 60 s. A 401 shows "Your session expired" with Log in; 429 shows the rate-limit copy. Failed card: admins get View details (`/runs/{run_id}` or `/logs?request_id=`), members get the copyable Reference.

Meta row: members "{n} actions prepared · {s} s" (seconds measured in the browser because the server omits `meta` for members, D8); admins "{tool_calls} tool calls · {s} s · {cost} · View trace".

## Proposal state

Each card is `{ row, status, prevStatus, draft, edited, fixed, confidence, message?, requestId?, undoUntil?, liveRule? }`. `row` is the `proposals` row exactly as read (or as returned by `workshop-agent`). Human changes go in `draft` and are sent as whitelisted `edits` (`create_hat`: quantity, grade, rows_per_inch, weaver_id; `advance_stage`: to_stage, expected_version; `flag_issue`: message).

- **Approve / Approve all valid:** optimistic `approved` card with Undo, one undo toast, decision queued for 10 s (D14). Due decisions go out in one `apply-proposals` call; the toast expiring (or being closed) sends them early; a hidden tab or `pagehide` sends them with a keepalive `fetch`. Results map back: `approved`, `blocked` (message, then the stored `rule_result` is re-read so the fix button appears), `failed` (conflict copy plus the request id).
- **Reject / Dismiss / Reject all:** sent immediately; the card collapses to "Rejected · Restore" or "Dismissed · Restore". If the call fails the card is put back with an error toast.
- **Restore:** `rpc("restore_proposal", { p_id, p_status })` with the status the card had before.
- **Question:** weaver chips fill `weaver_id` and make the card pending with high confidence. Choices that only carry a `hat_code` are shown disabled (no whitelisted edit can change the hat). "Someone else..." opens the edit form.
- **Blocked fix:** "Change to {Stage}" (from `rule_result.fix.to_stage`) or "Use {Grade}" (from `fix.grade`) applies the fix locally with "Fixed by you".
- **Edit:** per-type form, validated with `domain.ts` (`validateHatFields`, `gradeMismatchMessage` with a "Use X" fix, next stage only, flag message 1..200).
- **Failed:** "Refresh and retry" reads the hat's current `version`, sets `expected_version` and approves at once (no undo window, `approving` spinner).
- **Merging runs:** new cards go on top; open, queued or undo-window cards stay; resolved ones drop; toast "New proposals added. Earlier ones are still waiting below."
- **Completion:** when nothing is open, queued or in an undo window: "All done. {a} approved, {r} rejected." with View updated hats and Write another note; toast "{n} changes saved." after the last commit.
- Keyboard: focus a card, then A, E or R.

## Layout

Desktop: header, main column (`flex: 2 1 560px`: composer card, bubbles, proposals) and side column (`flex: 1 1 300px`: Today and Recent activity, or the first-run card when the workshop has no hats). Mobile (< 768px): everything stacks; a dock sits above the 64px tab bar. The dock shows the approve bar (mic, Reject all, Approve all valid) while cards are open and the composer is idle and empty; its mic swaps the dock to the voice composer and starts recording without clearing cards.

Accessibility: visible labels or `aria-label` on every control, `aria-live` on the live transcript and agent steps (toasts already have it), every card state has an icon and a text label, 44px targets (48px in mobile bars, 72px mic), focusable cards.

## Wired to the real backend vs pending

| Piece | Status |
|---|---|
| Login, sign-up, forgot, logout | Real Supabase Auth through server actions |
| `auth.*` logs | Real (`app_logs` insert as the user, `log_public` for failures) |
| Today tiles, Recent activity, first-run counts | Real queries under RLS (`hats`, `hat_events`, `hat_flags`, `proposals`, `weavers`) |
| Open proposals on load | Real (`proposals`, status pending/question/blocked/failed) |
| `workshop-agent` call | Real contract (`supabase.functions.invoke`, `x-request-id`, abort, 60 s timeout). Proposals without an id (not saved) are not shown |
| `apply-proposals` approve/reject | Real contract, results mapped per card |
| `restore_proposal` | Real (`p_id`, `p_status`) |
| `create_hat` (manual dialog) | Real (`p_weaver_id, p_grade, p_rows, p_straw, p_size, p_price, p_note`; the code is generated in SQL) |
| Shell pending badge | Real: `app/(app)/layout.tsx` counts open proposals and passes `pendingCount` to `AppShell` |
| Today tile filters | "Flags to check" links `/hats?flagged=1`; the other tiles open `/hats` (no stage filters in spec 08) |
| "Add weaver" | Links to `/weavers` (the weavers page owns the dialog) |
| Share a passport (first run) | Shown disabled, as in the handoff, until the first hat exists |

## Not built

Edit-note confirm ("Discard these proposals and edit your note?"), Attach (disabled with "Photos are coming soon."), streamed agent steps (D13 cut).
