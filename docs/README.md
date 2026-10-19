# Docs index

Every document in the repo, one line each, plus a suggested reading order. Live app: https://toquilla-trace.vercel.app

## Read them in the app

The main docs also render inside the app at [/docs](https://toquilla-trace.vercel.app/docs), no login needed. Pages are built once from the repo markdown ([app/docs/](../app/docs), list of pages in [lib/docs/registry.ts](../lib/docs/registry.ts)):

| In-app page | Source file |
|---|---|
| [/docs/overview](https://toquilla-trace.vercel.app/docs/overview) | [README.md](../README.md) |
| [/docs/handoff](https://toquilla-trace.vercel.app/docs/handoff) | [HANDOFF.md](../HANDOFF.md) |
| [/docs/architecture](https://toquilla-trace.vercel.app/docs/architecture) | [ARCHITECTURE.md](ARCHITECTURE.md) |
| [/docs/ai](https://toquilla-trace.vercel.app/docs/ai) | [AI.md](AI.md) |
| [/docs/security](https://toquilla-trace.vercel.app/docs/security) | [SECURITY.md](SECURITY.md) |
| [/docs/engineering](https://toquilla-trace.vercel.app/docs/engineering) | [ENGINEERING.md](ENGINEERING.md) |
| [/docs/evals](https://toquilla-trace.vercel.app/docs/evals) | [EVALS.md](EVALS.md) |
| [/docs/specs](https://toquilla-trace.vercel.app/docs/specs), plus one page per spec (`/docs/specs-00-conventions` to `/docs/specs-10-quality-evals-and-delivery`) | [specs/README.md](specs/README.md) and `specs/NN-*.md` |
| [/docs/design](https://toquilla-trace.vercel.app/docs/design) | [design_handoff_toquilla_trace/README.md](../design_handoff_toquilla_trace/README.md) |

The rest (EDGE, FOUNDATION, the UI docs, seed notes) are only in the repo.

## Suggested reading order

**10 minutes:**
1. [README.md](../README.md): the problem, the product and the decision log.
2. [HANDOFF.md](../HANDOFF.md): live link, demo accounts, what works, what is missing, how to run it.
3. [ARCHITECTURE.md](ARCHITECTURE.md): how the pieces fit and where each rule lives.
4. [EVALS.md](EVALS.md): the measured agent score (29 of 32) and why three cases failed.
5. [ENGINEERING.md](ENGINEERING.md) sections 4, 5 and 11: tests, quality gates, known gaps.

**45 minutes:** the 10-minute list, then:
1. [AI.md](AI.md): where AI is used, how it is boxed in, and the model choice.
2. [SECURITY.md](SECURITY.md): auth, row-level security, secrets, headers and prompt injection.
3. The rest of [ENGINEERING.md](ENGINEERING.md): conventions, logging, delivery and how AI was used to build it.
4. [EDGE.md](EDGE.md): the three Edge Functions and the recorded smoke test.
5. [specs/00-conventions.md](specs/00-conventions.md) sections 8 and 9: the decisions (D1 to D26) that override every spec.
6. [specs/05-domain-rules.md](specs/05-domain-rules.md): the business rules and their numbered test cases.
7. Skim one UI doc for the area you want to walk through: [UI-WORKSHOP.md](UI-WORKSHOP.md), [UI-PUBLIC.md](UI-PUBLIC.md) or [UI-HATS-ADMIN.md](UI-HATS-ADMIN.md).

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
| [FOUNDATION.md](FOUNDATION.md) | Scaffold guide for feature builders: versions, file map, aliases, components, logging, deviations from the specs |
| [../supabase/seed-notes.md](../supabase/seed-notes.md) | Database notes: migrations, triggers, SQL functions, demo seed and users |

### UI

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
