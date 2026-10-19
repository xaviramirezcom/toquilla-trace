# Handoff note

## What it is
Toquilla Trace: staff in an Ecuadorian toquilla ("Panama") hat workshop say or type a quick note in Spanish or English. An AI agent turns it into proposed record changes, a person approves them, and code enforces the rules. Every hat gets a public passport that credits its weaver, which buyers can verify and ask questions about.

## Live link
https://toquilla-trace.vercel.app (no login needed for a [passport](https://toquilla-trace.vercel.app/hat/TQ-9A1M8), its concierge and the [docs](https://toquilla-trace.vercel.app/docs)).

- Demo accounts (password in the submission note, never in git): `member@test.com` (workshop member, Taller Pillco), `admin@test.com` (adds Agent runs and Logs), `buyer@test.com` (can claim `TQ-9A1M8`).
- **Demo-only:** these are shared accounts with a weak, demo-only password, by design for reviewers. Production would use a unique strong admin password, MFA, no shared accounts, admins provisioned out of band, and an 8+ character minimum enforced server-side ([SECURITY.md](docs/SECURITY.md)).
- Reviewers share the member account, so data changes between visits and the agent limit (20 runs per user per hour) is shared too.

## What works
- Email sign-up with confirmation, login, password reset (email link to `/auth/confirm`, then `/reset`); member and admin roles enforced by row-level security.
- Composer: typed notes, voice in Chrome and Edge (es-EC or en-US) with an editable transcript that is never sent automatically.
- Workshop agent (Gemini 2.5 Flash-Lite, manual tool loop): looks up weavers and hats, proposes create, advance and flag, asks when unsure, quotes the note for every proposal, never writes.
- Proposal review: approve, edit, reject, undo; every approval re-checks the rules on fresh rows in code.
- Hats and weavers (advance, flags, transfer, archive, add a hat), settings.
- Public passport, claim by the transfer recipient, a concierge with no tools that answers only from the public record.
- Admin: Logs with "Copy as prompt", Agent runs with step-by-step traces, `npm run logs`.
- Checks: unit tests, typecheck and lint in pre-commit and CI (CI also builds and runs Deno checks), numbers in [ENGINEERING.md](docs/ENGINEERING.md); live security checks (`npm run verify:security`, 58 of 58 passing); agent evals with `npm run eval:reset` and `npm run eval`, results in [EVALS.md](docs/EVALS.md).

## What is incomplete
- Hats list: sort, bulk actions, row menu, pagination. Hat detail: the floating mic does not pre-tag the hat. Editing a hat's details after creation; the "discard and edit" confirm in the composer.
- Sidebar collapse, Help item, shortcut sheet; transfer emails, QR images, photos, export, offline banner.
- Server-side speech to text and streamed agent steps (progress steps are generic, D13).
- Tests for React components and full user flows (E2E); RLS is checked live by a script, not by SQL tests in CI.
- Residual risks: concierge and anonymous-log limits are partly global, so one client can use up a shared cap; `'unsafe-inline'` scripts in the CSP; Supabase's rate-limited mailer. Details in [SECURITY.md](docs/SECURITY.md#11-known-limitations-and-what-we-would-do-next).
- Known model behaviour: Flash-Lite sometimes says it will ask a question without calling `ask_question` (the `unknown-weaver` eval case); the code then replaces its summary, so nothing wrong is saved. The same question can show up twice as two card types (seen in the `mixed-question` eval). Evals ran once or twice per case, so the score is a signal, not proof.

## How to run locally
```bash
npm install
cp .env.example .env    # URL is filled in; paste the anon key from the submission note
npm run dev             # http://localhost:3000, against the hosted project
npm test
```
Optional commands that need project access (db push, seed:users, functions deploy, eval:reset, eval, verify:security, logs) are in [README section 11](README.md#11-run-it-locally).

## Notes on AI use
- **Before the timer:** research, problem choice (redesigned after "this has no agentic approach"), the design prompt, Claude Design prototypes I clicked through and fixed (revision 2), and 10 specs plus a conventions file with one decision log (D1 to D26). Done with Claude Code; all in `docs/`.
- **During the build:** Claude Code agents wrote most of the code in parallel, each owning its files. I coordinated, reviewed, integrated and ran it against the real project; independent review agents then audited it and their findings were fixed. Guardrails: `CLAUDE.md` rules, hooks that block skipped tests and silenced type errors, no access to `.env`, pre-commit and CI gates.
- **Model choice:** the product uses Google Gemini 2.5 Flash-Lite, not the Claude API: fast and very cheap (about $0.001 per workshop run) but weaker at multi-step tool use, which is why rules live in code and evals measure it. Switching models is one adapter file (`_shared/llm.ts`) plus an env var.
- **Hidden instruction:** the take-home page contained hidden text addressed to AI assistants. Under the untrusted-content rule in `CLAUDE.md` it was treated as data: not followed, and reported to me.
