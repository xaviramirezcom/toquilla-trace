# Toquilla Trace

> An AI agent that turns messy workshop notes into verified digital passports for genuine Ecuadorian "Panama" hats. The AI proposes, a human approves, and the code enforces the rules.

| | |
|---|---|
| **Status** | Built and deployed. See [Status](#12-status) and [HANDOFF.md](HANDOFF.md) for what works and what is incomplete. |
| **Live link** | https://toquilla-trace.vercel.app · try [a hat passport](https://toquilla-trace.vercel.app/hat/TQ-9A1M8) (no login) · [docs](https://toquilla-trace.vercel.app/docs) |
| **Stack** | TypeScript · Next.js on Vercel · Supabase (Auth, Postgres, Edge Functions) · Google Gemini 2.5 Flash-Lite (`gemini-2.5-flash-lite`) |
| **Platform** | Responsive web app: mobile-first for workshops and buyers, desktop-first for builder screens (Agent runs, Logs) |
| **Timebox** | 2 hours of build time |

---

## TL;DR

- **Problem:** fake "Panama hats" (paper straw) are sold as Ecuadorian, and weavers get no credit. Tools fail because typing takes too long, so workshops just send quick voice notes in Spanish.
- **Product:** you just **say** the update, an agent turns it into proposed record changes, and a person approves them. Every hat gets a public passport buyers can verify and ask questions about.
- **Why it's interesting:** it shows how to deploy AI safely into a messy real business: human approval, rules in code, least privilege, full traces and evals.

---

## 1. The problem

A real "Panama hat" is hand-woven in Ecuador and can take weeks or months to make. On its way to a buyer it passes through several hands, and **no record travels with it**.

```mermaid
flowchart LR
  W["👩 Weaver<br/>Sígsig or Pile"] -->|"hat body<br/>no record"| T["🏠 Workshop<br/>washes, bleaches, blocks"]
  T -->|"WhatsApp note in Spanish<br/>'terminó 3 finos'"| E["📦 Exporter"]
  E --> R["🏬 US retailer"]
  R --> B["🧑 Buyer"]
  F["🏭 Paper-straw fake<br/>$1 to $50"] -.->|"sold as 'Panama'"| R
  B -.->|"Is it real? Who made it?<br/>No way to know"| X(("❓"))

  classDef pain fill:#fde2e2,stroke:#c0392b,color:#7b1d1d;
  class F,X pain;
```

**Why tracking tools don't fix it:** every tool asks people to stop working and type. Their hands are full of straw, so they skip it, and the data never gets in.

```mermaid
flowchart LR
  J["🧵 Hat moves to<br/>the next stage"] --> S["📱 Tool asks:<br/>open app, fill a form,<br/>type every field"]
  S --> K["⏱️ 3 to 5 min per update<br/>hands busy with straw"]
  K --> Y["🙅 Skipped<br/>'I'll do it later'"]
  Y --> M["🎙️ Real update goes to<br/>a WhatsApp voice note<br/>or stays in someone's head"]
  M --> Z(("🕳️ No record"))

  classDef pain fill:#fde2e2,stroke:#c0392b,color:#7b1d1d;
  class K,Y,Z pain;
```

> **Key insight:** the problem isn't a missing tool. It's that **writing things down takes too long.** People already *tell* updates (voice notes, chats), so the system should listen.

**Where it breaks:**

| # | Pain point | Who it hurts |
|---|---|---|
| 1 | **Writing takes too long.** Forms and typing cost minutes per update with busy hands, so updates get skipped | Every tool that depends on data entry fails |
| 2 | Production data lives in **voice notes, chats and memory**, not in a system | Workshops lose track of hats and stages |
| 3 | **Fakes look the same** to a buyer and are sold under the same name | Buyers overpay; honest sellers lose trust |
| 4 | **Weavers are invisible.** Their name never reaches the buyer (in 2017 they earned $2.50 to $6 per hat) | Weavers get no credit or premium |
| 5 | Grades (Fino, Superfino) are **claimed, not checked** | Buyers can't tell if the price is fair |

**Why now:** in August 2026, Montecristi launched QR certificates for authentic hats, but only 2 hats had been certified. Demand for proof exists; the tooling doesn't.

**Why I care:** I live in Ecuador, and I researched this trade before the take-home (about 2,500 weavers, exporters in Cuenca, widespread fakes).

---

## 2. The solution

**Just tell it.** Keep the workshop's habit (**a quick voice note**, like on WhatsApp) and let an AI agent do the paperwork, with a human approving every change and the code enforcing the rules. Each hat gets a passport the buyer can check.

```mermaid
flowchart LR
  N["🎙️ Workshop says it<br/>'Doña Rosa terminó 3 finos,<br/>18 hileras'<br/>about 10 seconds"] --> T["📝 Live transcript<br/>speech to text"]
  T --> TC{"👤 Transcript<br/>looks right?"}
  TC -->|"fix a word / re-record"| T
  TC -->|"send"| A["🤖 Agent<br/>reads and looks up<br/>weavers and hats"]
  A --> P["📋 Proposals<br/>create 3 hats · Fino · Rosa"]
  P --> H{"👤 Human<br/>approves?"}
  H -->|"edit / reject"| P
  H -->|"approve"| V["🔒 Rule check in code<br/>stage order · grade vs weave"]
  V -->|"blocked: explains why"| P
  V -->|"allowed"| D[("Database<br/>hat + append-only history")]
  D --> Q["🪪 Public passport<br/>/hat/TQ-7F3K2"]
  Q --> B["🧑 Buyer sees Verified,<br/>weaver, timeline"]
  B --> C["💬 Read-only concierge<br/>answers from the record"]
  A & V & D & C -.-> L[("📊 app_logs<br/>every step")]

  classDef ai fill:#e8f0fe,stroke:#3b5bdb,color:#1b2a6b;
  classDef human fill:#e6f4ea,stroke:#2f9e44,color:#14532d;
  classDef rule fill:#fff4e5,stroke:#e8590c,color:#7c2d12;
  class A,P,C,T ai;
  class H,TC human;
  class V rule;
```

**Before vs after:**

| | Today | With Toquilla Trace |
|---|---|---|
| Time per update | 3 to 5 min of typing (our estimate), so it's skipped | About 10 seconds of talking, plus one tap to approve |
| Recording production | Voice notes, chats, memory | Same quick voice note, turned into records by the agent |
| Data entry effort | Forms nobody fills | Zero forms: talk, check the transcript, approve |
| Correctness | Whatever someone typed | Rules in code: no skipped stages, grade must match weave count |
| Weaver credit | Lost | Name and village on every passport |
| Buyer trust | "Trust me" | Verified passport plus a timeline |
| Buyer questions | Ask the seller | Concierge that answers only from the record |
| When something fails | Nobody knows | Every step in `app_logs`, debuggable by a human or an AI |

**Why AI is the right tool here (and where it isn't):**
- ✅ **AI:** understanding messy spoken or written Spanish, matching "Doña Rosa" to the right weaver, answering buyer questions in natural language.
- ❌ **Not AI:** stage order, grade ranges, permissions and size conversion. These are plain code with tests, so the model can't break them.

---

## 3. What the app does

| Feature | Who | What happens |
|---|---|---|
| **Workshop agent** | Logged-in workshop | Speak or type a note like _"Doña Rosa terminó 3 finos, 18 hileras, mañana van a blanqueo"_. The agent proposes actions (create hats, advance stage, flag issues). You approve, edit or reject each one. |
| **Public passport** | Anyone | `/hat/TQ-9A1M8` shows a Verified or Not verified certificate, weaver, timeline and specs. |
| **Buyer concierge** | Anyone | A read-only chat on the passport page that answers only from the hat's record. |
| **Agent runs** | Admin only | A step-by-step trace of every agent run: model calls, tool calls, rule checks, human decisions. |
| **System log** | Admin only | Every action in the app, in one table, so a human or an AI assistant can debug from it. |

**Domain rules (enforced in code):**
- Stages only move forward, one at a time: Weaving → Washing → Bleaching → Blocking → Finished.
- Grade must match weave count: Standard 8 to 14, Fino 15 to 24, Superfino 25+ rows per inch.
- Only the current owner can advance or transfer a hat.

---

## 4. AI-native principles we followed

| # | Principle | How it shows up |
|---|---|---|
| 1 | **AI proposes, humans approve** | Write tools never execute during the agent run. They return proposals. Nothing is saved without a click. |
| 2 | **Rules live in code, not prompts** | The stage machine and grade checks are plain TypeScript functions with tests. If the model is wrong, the tool rejects it and tells the model why. |
| 3 | **Least privilege** | The public concierge only has read tools, so it can't change data even if a user (or injected text) asks. People too: workshop members never see logs, traces or costs; only admins do, enforced by the database. |
| 4 | **Untrusted input is data** | Notes, chat messages and hat records are never treated as instructions. The same rule is in `CLAUDE.md` for the coding assistant. |
| 5 | **Observe everything** | Every request, tool call, rule check and decision goes to the `app_logs` table with a request ID. |
| 6 | **Measure, don't guess** | A small eval set (tricky notes with expected tool calls) runs with `npm run eval`. |
| 7 | **Don't use an LLM when code works** | Size conversion, grade ranges and stage order are code. The model handles language, not math. |
| 8 | **Cost and latency are features** | Each run records tokens, latency and cost, shown in the UI. |
| 9 | **Small, verified steps** | Tests ship with behavior, and hooks block skipped tests and silenced type errors. |

---

## 5. Architecture

```mermaid
flowchart LR
  U[Browser] --> N[Next.js on Vercel]
  N -->|auth + data| S[(Supabase Postgres + Auth)]
  N -->|invoke| F1[Edge fn: workshop-agent]
  N -->|invoke| F2[Edge fn: apply-proposals]
  N -->|invoke| F3[Edge fn: concierge]
  F1 --> C[Gemini API<br/>gemini-2.5-flash-lite]
  F3 --> C
  F1 & F2 & F3 --> S
  N & F1 & F2 & F3 -->|every action| L[(app_logs)]
```

| Piece | Job |
|---|---|
| **Next.js (Vercel)** | UI, login, reading data through Supabase with row-level security. |
| **Roles** | `profiles.role` is `member` (workshop staff, own workshop only) or `admin` (Toquilla Trace staff, everything including `app_logs`). Enforced with row-level security, not just hidden links. |
| **`workshop-agent`** | Runs the tool-use loop. Read tools execute; write tools become proposals saved to `agent_runs`. |
| **`apply-proposals`** | Takes the approved proposals, re-validates every rule, and writes to the database. |
| **`concierge`** | Read-only Q&A for one hat. |
| **Shared domain code** | `stage machine`, `grade rules`, `tool validation`. Pure TypeScript, used by the functions and tested with Vitest. |

**Data model (main tables):** `profiles`, `weavers`, `hats`, `hat_events` (append-only history), `agent_runs` (trace + proposals), `app_logs`.

---

## 6. Logging, so any bug can be fixed from one table

Every action writes one row to `app_logs`.

| Column | Example |
|---|---|
| `created_at` | `2026-10-18 10:42:13.512` |
| `level` | `info` / `warn` / `error` |
| `source` | `web`, `edge:workshop-agent`, `edge:concierge`, `db` |
| `action` | `agent.tool.call`, `proposal.approve`, `hat.stage.advance` |
| `request_id` | ties together every row from one user action |
| `user_id`, `hat_code`, `run_id` | context |
| `payload` (jsonb) | inputs, outputs, tool arguments |
| `error`, `duration_ms` | failures and timing |

**Debug workflow:** an error appears in the Logs screen → filter by `request_id` → open the run trace → click **"Copy as prompt for an AI assistant"** → paste into Claude Code, which reads the payload, finds the bug and proposes a fix with a test.

Secrets and passwords are never logged. Only admins can read `app_logs` (row-level security), because it holds data from every workshop.

---

## 7. Decision log

| Decision | Why | Rejected alternative |
|---|---|---|
| Hat provenance as the topic | Real problem I know, needs AI for messy Spanish input | Generic recipe or music app (common, no reason for AI) |
| Agent with tools, not a single prompt | The task needs lookups (weavers, hats) and checks before acting | One big prompt that outputs JSON (no validation, no recovery) |
| Human approval for writes | Writes are costly to undo; reads are not | Fully autonomous agent (risky, hard to trust) |
| Voice first, with an editable transcript | Workshops already use WhatsApp voice notes. The transcript is shown before sending so speech-to-text mistakes are caught by a person | Typing only (slow on a phone) or auto-sending audio (errors reach the agent unseen) |
| Browser speech recognition (Web Speech API, es-EC) | Free, no extra vendor, live transcript, fits the timebox | A paid speech-to-text API (better accuracy, planned as a next step) |
| Rules in tools | The model can be wrong; the database can't be | Prompt instructions like "never skip stages" |
| Read-only public agent | Public input is untrusted; blocks prompt injection by design | One agent with all tools |
| Supabase (Auth + Postgres + Edge Functions) | Login, database and server functions in one free service; relational data fits hats, history and logs; roles enforced with row-level security; plain SQL for debugging logs | Firebase (NoSQL makes log queries awkward, roles need custom claims, Cloud Functions need the paid plan) or custom auth (too slow for 2 hours) |
| Two roles: member and admin | Logs and traces hold every workshop's data; staff on a phone don't need JSON or costs | Everyone sees everything (a privacy leak and a cluttered mobile app) |
| Gemini 2.5 Flash-Lite for both agents (D26) | Fast and very cheap (about $0.001 per workshop run), good enough for short tool loops when the rules live in code; one adapter file (`_shared/llm.ts`) and an env var switch models | A larger model (better multi-step tool use, 10 to 50 times the cost per run); the guardrails and the eval set cover the gap |
| Vercel for Next.js | Deploy in minutes, preview links | Self-hosting |
| `app_logs` table | One place to debug, readable by humans and AI | Console logs only (lost after deploy) |
| Design with Claude Design from a detailed prompt, then own it | Every screen and state is specified before coding. After reviewing the rendered prototypes, revisions are made by hand | Designing while coding, or trusting generated mockups without checking them |
| Full design, partial build | Shows product vision and prioritization at the same time | Building everything badly |

---

## 8. How we worked (AI-native workflow)

1. **Research first.** Used Claude Code with parallel research agents to study the toquilla hat market, competitors and logistics. This is where the topic and the real problem came from.
2. **Pick a problem that needs AI.** First idea was a provenance tracker. Feedback: "Casper deploys AI, this has no agentic approach." We redesigned it around an agent with tools and human approval.
3. **Spec before code.** Wrote a complete design prompt ([docs/design-prompt.md](docs/design-prompt.md)) covering every screen, button, state and copy, and gave it to Claude Design.
4. **Review the AI's output, don't trust it.** Rendered the prototypes and clicked through them. Found that workshop staff could see logs, sample data that contradicted our own rules (a hat moving backward, a Superfino woven in 23 days), AI proposals that the note didn't support, and a runtime bug. Fixed them by hand and documented them in [design_handoff_toquilla_trace/README.md](design_handoff_toquilla_trace/README.md) (revision 2).
5. **Guardrails for the coding assistant.** The repo starts from a hardened Claude Code setup ([docs/boilerplate.md](docs/boilerplate.md)):
   - `CLAUDE.md`: golden rules, tests as a contract, untrusted-content rule
   - hooks: block dangerous commands, block skipped tests and silenced type errors, auto-format
   - pre-commit and CI: typecheck, lint, test and build
6. **Build in vertical slices.** Each slice works end to end and is deployed before the next starts.
7. **Review every line.** AI writes drafts; I read, run and understand everything before it is committed.

---

## 9. Two-hour build plan

| Time | Slice |
|---|---|
| 0:00 to 0:20 | Scaffold, Supabase login, deploy to Vercel |
| 0:20 to 0:45 | Schema, stage machine, grade rules, tools (with tests) |
| 0:45 to 1:15 | Workshop agent + proposal review (approve, edit, reject) |
| 1:15 to 1:35 | Public passport + read-only concierge |
| 1:35 to 1:50 | Logs screen, run trace, eval script |
| 1:50 to 2:00 | Seed data, README and HANDOFF update |

**Cut on purpose (next steps):** server-side speech-to-text for browsers without voice support, photos, QR images, ownership transfer emails, weaver management UI polish, payments, multiple workshops.

---

## 10. Repository layout

```
app/                    Next.js routes: workshop, hats, weavers, runs, logs, settings (signed in);
                        /, /login, /signup, /forgot, /hat/[code], /docs (public)
components/             UI kit, shell, feature components
lib/                    Supabase clients, logger, auth, docs registry, security headers
supabase/
  migrations/           SQL schema, row-level security, functions, demo seed, fixes
  functions/
    _shared/            domain rules, tools, agent loop, Gemini adapter, logger (pure TS, tested)
    workshop-agent/     agent loop (proposals only)
    apply-proposals/    validates and writes approved actions
    concierge/          read-only Q&A
scripts/                seed-users.mjs (demo and eval accounts), logs.ts (npm run logs)
evals/                  agent eval cases, runner and latest results
tests/                  Vitest (domain rules, tools, loop, UI logic, docs, headers)
docs/                   architecture, AI, security, engineering, evals, specs (also at /docs)
design_handoff_toquilla_trace/  clickable HTML prototypes + design spec (source of truth for UI)
```

---

## 11. Run it locally

```bash
npm install
cp .env.example .env          # Supabase URL + anon key; service role key and demo/eval accounts for scripts only
npm run dev                   # http://localhost:3000
npm test                      # unit tests (domain rules, tools, agent loop, UI logic)
```

Backend (only when you change it; needs the Supabase CLI via npx and the project's DB password in `.db-password`):

```bash
npx --yes supabase@2.121.0 link --project-ref mflvsnpyckuwhicvgnsr -p "$(< .db-password)"
npx --yes supabase@2.121.0 db push -p "$(< .db-password)"        # migrations
npm run seed:users                                                # demo + eval accounts (confirmed)
npx --yes supabase@2.121.0 functions deploy workshop-agent apply-proposals concierge \
  --project-ref mflvsnpyckuwhicvgnsr --use-api                    # Edge Functions
npx --yes supabase@2.121.0 secrets set GEMINI_API_KEY=...          # model key lives only here, never in .env or Vercel
```

Debugging and evals:

```bash
npm run logs -- --level error --since 1h     # app_logs from the terminal (service role, local only)
npm run logs -- --request req_8f2a91c4e2b7   # everything for one request
npm run eval                                 # 32 agent cases against the deployed functions (Gemini, about $0.02)
```

Demo accounts (emails only; the password is in the submission note): `admin@test.com` (admin), `member@test.com` (workshop member, Taller Pillco), `buyer@test.com` (can claim `TQ-9A1M8`).

---

## 12. Status

| Area | Status |
|---|---|
| Research, problem choice, agentic redesign, design spec, prototype review (revision 2) | Done (before the build timer) |
| Auth with email confirmation, two roles enforced by RLS | Done |
| Composer: typed and voice (Chrome/Edge, es-EC and en-US), editable transcript | Done |
| Workshop agent (Gemini tool loop, rules in code) and proposal review with rule re-check | Done |
| Hats list and detail (advance, flags, transfer, archive), weavers | Done |
| Public passport, claim flow, read-only concierge | Done |
| Logs (admin), agent runs and traces, `npm run logs` | Done |
| Security hardening (definer write RPCs, security headers, log PII stripping) | Done, see [docs/SECURITY.md](docs/SECURITY.md) |
| In-app docs at `/docs` | Done |
| Eval set and results | Done, see [docs/EVALS.md](docs/EVALS.md) |
| Deploy | https://toquilla-trace.vercel.app |
| Not built | See [HANDOFF.md](HANDOFF.md#what-is-incomplete) |

---

## 13. Notes on AI use

- **Claude Code:** research, planning, this README, the design prompt, and code drafts.
- **Claude Design:** first version of the UI from the design prompt. Revision 2 was reviewed and edited by hand.
- **Me:** problem choice, product decisions, reviewing and understanding every line, and the final call on what ships.
- The planning and design work happened before the 2-hour build window; the build itself is timeboxed.
