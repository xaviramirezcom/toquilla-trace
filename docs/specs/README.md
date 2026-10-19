# Specs: Toquilla Trace

> **Pre-build plan (historical).** Decisions D1 to D26 in 00-conventions ([section 8](00-conventions.md#8-decisions-after-spec-review-these-override-sections-1-to-7-and-any-spec), [section 9](00-conventions.md#9-model-provider-change-d26-overrides-section-5-d8-cost-numbers-d16-and-d17)) override it; the app uses Gemini 2.5 Flash-Lite (D26), not the Claude API.
> Current status: [HANDOFF.md](../../HANDOFF.md). Unchecked boxes below are the plan's acceptance list, not a status report.

What we'll be judged on, and the detailed spec for every feature that answers it.

- Start with [00-conventions.md](00-conventions.md): stack, schema, contracts, model API facts (section 5 describes the Claude API; replaced by Gemini in section 9, D26), logging and time budget. Every spec follows it.
- **Sections 8 and 9 of the conventions (decisions D1 to D26) override everything else.** The specs were written in parallel, and their conflicts were resolved there.
- **Build order and the 2-hour timeline:** [10-quality-evals-and-delivery.md](10-quality-evals-and-delivery.md).
- UI source of truth: [design_handoff_toquilla_trace/README.md](../../design_handoff_toquilla_trace/README.md) (revision 2).

---

## Part 1. The 10 things Casper will most likely evaluate

The take-home page gives requirements but no scoring rubric, so this list is our inference from the brief, the 45-minute follow-up format and Casper's business (deploying AI into companies).

### 1. It works end to end, live
- **What they check:** open the public link, sign up or log in, do the main job, see the result persist. No dead buttons on the main path.
- **Why it matters:** the brief asks for "something that works from start to finish, not a demo of one screen".
- **How we answer it:** deploy in the first 20 minutes, then add features one vertical slice at a time. The main path is: say a note → review proposals → approve → open the hat's public passport.
- **Specs:** 01, 02, 03, 04, 06, 10.

### 2. Real application logic, not forms that save data
- **What they check:** is there logic you couldn't get from a CRUD generator?
- **How we answer it:** a stage state machine, grade versus weave rules, anomaly detection, optimistic locking, an agent tool loop with rule checks, claim rules per viewer and code normalization for misheard spoken codes.
- **Specs:** 03, 04, 05, 06.

### 3. Several real interactions
- **What they check:** more than one happy path or one button.
- **How we answer it:** voice or typed note, approve / edit / reject / answer a question / fix a blocked card, advance a stage, add a weaver, verify a code, claim a hat, chat with the concierge, and debug from logs.
- **Specs:** 02, 04, 06, 07, 08, 09.

### 4. Authentication done properly
- **What they check:** login works, and protected pages are actually protected.
- **How we answer it:** Supabase Auth, a `member` / `admin` role enforced with row-level security in the database (not just hidden links), a public passport through a narrow security-definer function, and admin-only logs.
- **Specs:** 01, 06, 09.

### 5. Prioritization within the timebox
- **What they check:** what you built first, what you cut and whether you knew why.
- **How we answer it:** every spec marks items as Must, Nice or Cut. There's a master timeline with checkpoints and a cut order if we fall behind, and the HANDOFF lists what's missing honestly.
- **Specs:** 10 (master timeline), plus the Scope table in every spec.

### 6. Product taste and passion
- **What they check:** does the user's world show through? Would someone who shares the problem care?
- **How we answer it:** the insight is "Just tell it" (typing is why tracking tools fail, so voice comes first and the transcript is reviewed). There's a premium passport that credits the weaver by name, Spanish-first, mobile-first, with copy written for real workshop staff.
- **Specs:** 02, 06, design handoff.

### 7. Code you can explain, line by line
- **What they check:** in the 45-minute session, can you say why each piece exists and how you'd change it?
- **How we answer it:** small typed modules, pure domain rules in one file with tests, no magic frameworks, and an "Interview talking points" section in every spec.
- **Specs:** 05, 10, plus section 13 of every spec.

### 8. Judgment about AI, in the product
- **What they check:** this is an AI deployment company, so they'll look at how safely and usefully AI is deployed.
- **How we answer it:**
  - AI proposes and humans approve; rules live in code, not prompts.
  - The public agent is read-only (least privilege), and notes and records are treated as untrusted data (prompt injection).
  - Answers are grounded in the record, with source pills.
  - Every step is logged with cost and latency, and there's an eval set.
  - No LLM where plain code is enough (grades, sizes, stage order).
- **Specs:** 03, 04, 05, 07, 09, 10.

### 9. Judgment about AI, in how you built it
- **What they check:** AI tools are allowed, but blind trust is not. The page has a hidden instruction aimed at AI assistants.
- **How we answer it:** the repo's `CLAUDE.md` treats untrusted content as data, hooks block skipped tests and silenced type errors, and we rendered and reviewed the AI-generated design and fixed what was wrong (documented in revision 2). The AI-use note is honest and mentions the hidden instruction.
- **Specs:** 10, README "How we worked".

### 10. Shipping and handoff, ready to extend
- **What they check:** a public link, local run steps, a short note on what works and what's missing, and a base that's easy to extend live.
- **How we answer it:** a filled HANDOFF.md, a README with diagrams and a decision log, seed data, short setup steps, `app_logs` so any bug can be traced, and clear extension points (WhatsApp intake, phone login, QR codes, more evals).
- **Specs:** 09, 10.

---

## Part 2. Feature specs

| # | Spec | What it covers | Main criteria |
|---|---|---|---|
| 00 | [Conventions](00-conventions.md) | Stack, schema, contracts, model API facts (Gemini since D26), logging, time budget | All |
| 01 | [Auth and roles](01-auth-and-roles.md) | Sign up, login, member/admin, RLS on every table, route guards | 1, 4 |
| 02 | [Voice composer](02-voice-composer.md) | "Just tell it": speech to text, review before send, typed fallback | 3, 6 |
| 03 | [Workshop agent](03-workshop-agent.md) | System prompt, strict tools, loop, rule checks, eval set | 2, 8 |
| 04 | [Proposal review](04-proposal-review.md) | 8 card states, approve/edit/reject/undo, transactional apply | 2, 3, 8 |
| 05 | [Domain rules](05-domain-rules.md) | Stage machine, grades, anomalies, codes, 40+ unit tests | 2, 7 |
| 06 | [Passport and claim](06-passport-and-claim.md) | Public certificate, verify, claim rules, privacy | 1, 4, 6 |
| 07 | [Buyer concierge](07-buyer-concierge.md) | Read-only grounded chat, injection handling, eval set | 3, 8 |
| 08 | [Hats and weavers](08-hats-and-weavers.md) | List, detail, advance, flags, transfer, weavers | 3 |
| 09 | [Observability](09-observability-logs-runs.md) | `app_logs`, `agent_runs`, admin Logs and Runs, Claude debug workflow | 8, 10 |
| 10 | [Quality, evals and delivery](10-quality-evals-and-delivery.md) | Tests, evals, CI, setup, deploy, master timeline, handoff, interview prep | 1, 5, 7, 9, 10 |

Every spec uses the same 14 sections: summary, scope (Must/Nice/Cut), user stories, UI, data, server logic, rules and edge cases, logging, security, tests, acceptance criteria, build plan, interview talking points and open questions.
