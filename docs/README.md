# Docs index

Every document in the repo, one line each, plus a suggested reading order. Live app: https://toquilla-trace.vercel.app

## Read them in the app

The main docs also render inside the app at [/docs](https://toquilla-trace.vercel.app/docs), no login needed. Pages are built once from the repo markdown ([app/docs/](../app/docs), list of pages in [lib/docs/registry.ts](../lib/docs/registry.ts)):

| In-app page | Source file |
|---|---|
| [/docs/overview](https://toquilla-trace.vercel.app/docs/overview) | [README.md](../README.md) |
| [/docs/handoff](https://toquilla-trace.vercel.app/docs/handoff) | [HANDOFF.md](../HANDOFF.md) |
| [/docs/guide](https://toquilla-trace.vercel.app/docs/guide) | this file |
| [/docs/architecture](https://toquilla-trace.vercel.app/docs/architecture) | [ARCHITECTURE.md](ARCHITECTURE.md) |
| [/docs/ai](https://toquilla-trace.vercel.app/docs/ai) | [AI.md](AI.md) |
| [/docs/security](https://toquilla-trace.vercel.app/docs/security) | [SECURITY.md](SECURITY.md) |
| [/docs/engineering](https://toquilla-trace.vercel.app/docs/engineering) | [ENGINEERING.md](ENGINEERING.md) |
| [/docs/evals](https://toquilla-trace.vercel.app/docs/evals) | [EVALS.md](EVALS.md) |
| [/docs/specs](https://toquilla-trace.vercel.app/docs/specs), plus one page per spec (`/docs/specs-00-conventions` to `/docs/specs-10-quality-evals-and-delivery`) | [specs/README.md](specs/README.md) and `specs/NN-*.md` |
| [/docs/design](https://toquilla-trace.vercel.app/docs/design) | [design_handoff_toquilla_trace/README.md](../design_handoff_toquilla_trace/README.md) |

The rest (EDGE, FOUNDATION, the UI docs, seed notes) are only in the repo.

## Suggested reading order

Same order as the [/docs](https://toquilla-trace.vercel.app/docs) index in the app.

**10 minutes:**
1. [README.md](../README.md): start with "For reviewers" (demo accounts, 3-minute tour, the 8 core files), then the problem and the decision log.
2. [HANDOFF.md](../HANDOFF.md): what works, what is missing, how to run it, AI-use note.
3. [SECURITY.md](SECURITY.md): the demo-password note at the top, then the TL;DR.
4. [ARCHITECTURE.md](ARCHITECTURE.md): how the pieces fit and where each rule lives.
5. [AI.md](AI.md): where AI is used, how it is boxed in, and the model choice.

**45 minutes:** the 10-minute list, then:
1. [ENGINEERING.md](ENGINEERING.md): tests, quality gates, logging, delivery, known gaps. The current test and build numbers live only there.
2. [EVALS.md](EVALS.md): the measured agent score and why cases failed. Eval numbers live only there.
3. [specs/README.md](specs/README.md) and [specs/00-conventions.md](specs/00-conventions.md) sections 8 and 9: the decisions (D1 to D26) that override the pre-build plan.
4. Optional: [EDGE.md](EDGE.md) for the Edge Function contracts, [specs/05-domain-rules.md](specs/05-domain-rules.md) for the numbered rule cases.

## All documents

### Start here

| Doc | What it is |
|---|---|
| [README.md](../README.md) | Product overview: problem, solution, principles, architecture sketch, decision log |
| [HANDOFF.md](../HANDOFF.md) | Handoff note: live link, demo accounts, what works, what is incomplete, AI-use note |

### How it is built

| Doc | What it is |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, data flow, where each rule is enforced, how to extend it |
| [AI.md](AI.md) | Agent and concierge design, guardrails, model choice |
| [EVALS.md](EVALS.md) | Eval results against the deployed functions: per-case table, cost, latency, the failures and what changed |
| [SECURITY.md](SECURITY.md) | Authentication, authorization (RLS), data safety, AI safety, secrets, security headers |
| [ENGINEERING.md](ENGINEERING.md) | Engineering practices: conventions, types, tests, quality gates, logging, delivery, AI-assisted workflow, gaps |
| [EDGE.md](EDGE.md) | The `workshop-agent`, `apply-proposals` and `concierge` Edge Functions: contracts, env, deploy, smoke test |
| [FOUNDATION.md](FOUNDATION.md) | Build notes: the scaffold guide given to feature agents (versions, file map at scaffold time, aliases, deviations from the specs) |
| [../supabase/seed-notes.md](../supabase/seed-notes.md) | Database notes: migrations, triggers, SQL functions, demo seed and users |

### UI (build notes written during implementation; may be outdated)

| Doc | What it is |
|---|---|
| [UI-WORKSHOP.md](UI-WORKSHOP.md) | Login, signup, forgot password and the workshop screen (composer and proposals) |
| [UI-PUBLIC.md](UI-PUBLIC.md) | Landing page, public passport, claim and buyer concierge |
| [UI-HATS-ADMIN.md](UI-HATS-ADMIN.md) | Hats, Weavers, Settings, admin Logs and Agent runs, plus `npm run logs` and `npm run eval` |
| [../design_handoff_toquilla_trace/README.md](../design_handoff_toquilla_trace/README.md) | Design handoff (revision 2): the UI source of truth, with clickable HTML prototypes |

### Planning (written before the timed build)

| Doc | What it is |
|---|---|
| [specs/README.md](specs/README.md) | What we expect to be judged on, and the list of feature specs |
| [specs/00-conventions.md](specs/00-conventions.md) | Shared stack, schema, contracts, logging rules and the final decisions D1 to D26 |
| [specs/01-auth-and-roles.md](specs/01-auth-and-roles.md) to [specs/10-quality-evals-and-delivery.md](specs/10-quality-evals-and-delivery.md) | One spec per feature, each with scope (Must, Nice, Cut), tests and acceptance criteria |
| [design-prompt.md](design-prompt.md) | Historical: the prompt that produced the first design |
| [boilerplate.md](boilerplate.md) | The Claude Code guardrail setup this repo started from |
