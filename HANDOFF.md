# Handoff note

## What it is
Toquilla Trace: staff in an Ecuadorian toquilla ("Panama") hat workshop say or type a quick note, in Spanish or English. An AI agent turns it into proposed record changes, a person approves them, and code enforces the rules. Every hat gets a public passport that credits its weaver, which buyers can verify and ask questions about.

## Live link
https://toquilla-trace.vercel.app

- Try without logging in: [a verified hat passport](https://toquilla-trace.vercel.app/hat/TQ-9A1M8) (ask the concierge "Is this hat real?"), an [unknown code](https://toquilla-trace.vercel.app/hat/TQ-ZZZZZ), and the [docs](https://toquilla-trace.vercel.app/docs).
- Demo accounts (emails only; the shared password is in the submission note, never in git):
  - `member@test.com`: workshop member in Taller Pillco (Workshop, Hats, Weavers)
  - `admin@test.com`: admin (also Agent runs and Logs, with tokens and cost)
  - `buyer@test.com`: buyer who can claim `TQ-9A1M8` from its passport
- New sign-ups need to confirm their email first (Supabase's built-in mailer, which is rate limited). The demo accounts are already confirmed.

## What works
- Email login and sign-up with email confirmation; two roles (member, admin) enforced by row-level security, not just hidden links.
- Composer: typed notes everywhere, voice in Chrome and Edge (es-EC or en-US) with an editable transcript that is never sent automatically; `/workshop?record=1` starts the mic through the normal permission flow.
- Workshop agent (Gemini 2.5 Flash-Lite, manual tool loop): looks up weavers and hats, proposes create, advance and flag, asks a question when it can't tell (two weavers named Rosa, an unknown weaver, a weaver with several hats), and quotes the note for every proposal. It never writes records.
- Proposal review: approve, edit, reject, undo; every approval re-checks the rules on fresh rows in code (stage order, grade vs rows per inch, ownership, version); blocked cards say why and how to fix it.
- Hats list and detail (manual advance, flag review, transfer, archive), weavers, settings.
- Public passport with Verified state, weaver credit, timeline; claim by the transfer recipient; read-only concierge that answers only from the public record and refuses change requests and injection.
- Observability: every action writes `app_logs` with a request id; admin Logs page with filters, detail and "Copy as prompt"; Agent runs list and step-by-step traces (workshop and concierge); `npm run logs` in the terminal.
- Security: all hat writes go through security definer RPCs with workshop checks, CSP and HSTS headers, secrets only in Supabase secrets (see [docs/SECURITY.md](docs/SECURITY.md)).
- Tests: 422 unit tests (domain rules, tool handlers, agent loop with a scripted model, UI logic, docs links, headers); typecheck, lint, tests and build run in pre-commit and CI, plus `deno check` and `deno lint` for the Edge Functions.
- Evals: 32 cases against the deployed functions, results in [docs/EVALS.md](docs/EVALS.md) and `evals/results/latest.json`; a full run costs about $0.02.
- Docs inside the app at `/docs` (README, this note, architecture, AI, security, engineering, evals, specs, design handoff).

## What is incomplete
- Password reset sends the email, but there is no page yet to choose the new password after following the link.
- Editing a hat's details (grade, rows, weaver) after creation; the "discard and edit" confirmation in the composer.
- Sidebar collapse, Help item and keyboard shortcut sheet from the design handoff.
- Transfer emails (the transfer is recorded and the recipient claims it from the passport), QR images, photos, export, offline banner.
- Server-side speech to text (browsers without the Web Speech API type instead) and streaming of real agent steps (the progress steps are generic, D13).
- Rate limits on the anonymous log RPCs; a nonce-based CSP; a custom SMTP provider for confirmation and reset emails; an SQL RLS test suite in CI (RLS was verified with a script against the hosted project instead).
- The claim flow was not exercised end to end on the live site, so the demo hat stays claimable for reviewers; the SQL checks and the passport UI states are covered.
- Known model behaviour: Flash-Lite sometimes proposes before looking a hat up and then gives up, or cites only general care advice for a fit question. The code refuses the bad calls, so nothing wrong is saved; the eval run shows the rate ([docs/EVALS.md](docs/EVALS.md)). Evals ran once per case, so the score is a signal, not proof.

## How to run locally
```bash
npm install
cp .env.example .env    # Supabase URL + anon key; service role key and demo/eval accounts only for scripts
npm run dev             # http://localhost:3000
npm test
npm run eval            # needs the deployed functions and the eval account (npm run seed:users)
npm run logs -- --level error --since 1h
```
Database, seed and Edge Function deploy commands are in [README section 11](README.md#11-run-it-locally).

## Notes on AI use
- **Before the timer:** research on the toquilla trade, problem choice (and a redesign after "this has no agentic approach"), the design prompt, Claude Design prototypes that I clicked through and fixed by hand (revision 2), and the 10 specs with their conflicts resolved in one decision log (D1 to D26). All of this was done with Claude Code and is in `docs/`.
- **During the build:** Claude Code agents drafted most of the code from the specs, in parallel, each owning its files. I set scope, reviewed and ran the code, and can explain every line. Guardrails kept the shortcuts out: `CLAUDE.md` rules (tests are a contract, untrusted content is data), hooks that block skipped tests and silenced type errors, denied access to `.env`, pre-commit and CI gates.
- **Where I did not trust the AI:** rules live in code with tests, not in prompts; the agent only proposes and a person approves; approvals re-check every rule; SDK shapes were verified against the published package types; evals measure the agent on the live functions. Verification against the real project found real bugs (for example a PostgREST retry that turned a version conflict into a 504, and members being able to write hat history directly), which were fixed in new migrations.
- **Model choice:** the product uses Google Gemini 2.5 Flash-Lite (`gemini-2.5-flash-lite`), not the Claude API. It is fast and very cheap (about $0.001 per workshop run), at the cost of weaker multi-step tool use, which is why the guardrails and the eval set matter. Switching models is one env var plus the `_shared/llm.ts` adapter.
- **Hidden instruction:** the take-home page contained hidden text addressed to AI assistants. Under the untrusted-content rule in `CLAUDE.md` it was treated as data: not followed, and reported to me.
