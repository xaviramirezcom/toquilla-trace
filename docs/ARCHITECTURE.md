# Architecture

How Toquilla Trace is built, where each rule lives, and how to extend it. Every behaviour claim links to the code that does it. Anything not built yet is in [section 8](#8-not-implemented-yet).

Companion docs: [AI.md](AI.md) (agent and concierge design), [SECURITY.md](SECURITY.md) (threat model, RLS, secrets), [supabase/seed-notes.md](../supabase/seed-notes.md) (every table, function and seed row), [specs/00-conventions.md](specs/00-conventions.md) (decisions D1 to D26).

---

## 1. One-screen overview

- **Workshop staff** say or type a note in Spanish or English. A Gemini agent reads it, looks up weavers and hats, and returns **proposals**. Nothing is saved yet.
- **A person** approves, edits or rejects each proposal. Approvals wait 10 s in the browser (undo), then go to `apply-proposals`, which re-checks every rule on fresh rows and writes through one SQL function.
- **Buyers** open `/hat/TQ-XXXXX`, see a public passport built by one security-definer SQL function, and can ask a read-only concierge that only sees that same public record.
- **Admins** see every agent run step by step and every log row, and can copy any log row as a prompt for a coding assistant.

```mermaid
flowchart LR
  subgraph Browser
    UI["Next.js pages<br/>React client components"]
    SR["Web Speech API<br/>es-EC / en-US"]
  end
  subgraph Vercel
    RSC["Next.js 16 App Router<br/>server components + proxy.ts<br/>anon key only"]
  end
  subgraph Supabase
    AUTH["Auth<br/>email + password"]
    PG[("Postgres<br/>RLS on every table<br/>triggers + RPCs")]
    subgraph Edge["Edge Functions (Deno)"]
      WA["workshop-agent"]
      AP["apply-proposals"]
      CO["concierge"]
    end
    LOGS[("app_logs")]
  end
  GEM["Gemini API<br/>gemini-2.5-flash-lite"]

  SR --> UI
  UI --> RSC
  RSC -->|"user JWT, RLS"| PG
  UI -->|"sign in"| AUTH
  UI -->|"functions.invoke + x-request-id"| WA & AP & CO
  WA -->|"reads: user JWT (RLS)<br/>writes run: service role"| PG
  AP -->|"service role, after rule re-check"| PG
  CO -->|"anon key: public_hat_passport"| PG
  WA & CO --> GEM
  UI -->|"web rows (RLS) or log_public"| LOGS
  WA & AP & CO -->|"service role"| LOGS
  PG --- LOGS
```

| Piece | Job | Code |
|---|---|---|
| Next.js on Vercel | Pages, session refresh, reads through RLS with the anon key. No service role key in the web app (D6, D24) | [proxy.ts](../proxy.ts), [lib/supabase/server.ts](../lib/supabase/server.ts), [lib/env.ts](../lib/env.ts) |
| Supabase Auth | Email and password; a trigger creates every profile as `member` | [schema.sql:295-318](../supabase/migrations/20261019000001_schema.sql#L295-L318) |
| Postgres + RLS | Members see their own workshop, admins read everything, anon reads nothing directly | [rls.sql](../supabase/migrations/20261019000002_rls.sql) |
| `workshop-agent` | Tool-use loop. Read tools run; write tools only buffer proposals | [workshop-agent/index.ts](../supabase/functions/workshop-agent/index.ts), [_shared/agent.ts](../supabase/functions/_shared/agent.ts), [_shared/tools.ts](../supabase/functions/_shared/tools.ts) |
| `apply-proposals` | Human decisions in, rule re-check, transactional write. The HTTP shell is small; the decision loop (`decideOne`) and `validateApproval` live in `_shared/apply.ts` so they are unit tested | [apply-proposals/index.ts](../supabase/functions/apply-proposals/index.ts), [_shared/apply.ts](../supabase/functions/_shared/apply.ts) |
| `concierge` | Public read-only Q&A, no tools, JSON output | [concierge/index.ts](../supabase/functions/concierge/index.ts), [_shared/concierge.ts](../supabase/functions/_shared/concierge.ts) |
| Gemini adapter | The only file that imports the model SDK | [_shared/llm.ts](../supabase/functions/_shared/llm.ts) |
| `app_logs` | One row per action, admin read only | [schema.sql:146-163](../supabase/migrations/20261019000001_schema.sql#L146-L163), [_shared/log.ts](../supabase/functions/_shared/log.ts), [lib/log.ts](../lib/log.ts) |

---

## 2. Repo map

```
app/
  (app)/                 signed-in shell: workshop, hats, hats/[code], weavers, runs, runs/[id], logs, settings
  hat/[code]/            public passport (no shell)
  login/ signup/ forgot/ reset/ auth pages; auth/confirm/ handles email links (confirm, reset)
components/
  workshop/              composer, proposal cards, undo queue hook (useProposals), agent steps
  concierge/             chat panel on the passport
  passport/              certificate, timeline, claim dialog
  admin/                 RunsList, RunDetail (trace), LogsView (filters + copy as prompt)
  ui/ shell/             design system and app shell
lib/
  voice/                 speech recognition hook + pure reducer (review before send)
  workshop/              Edge Function calls, proposal card logic, 10 s queue
  passport/              passport fetch, story, ownership view, concierge client helpers
  admin/                 run and log queries, eval scoring, logs CLI formatting
  log.ts                 browser logger (batched, redacted)
supabase/
  migrations/            0001 schema, 0002 RLS, 0003 RPCs, 0004 demo seed, then fixes: errcode, definer hat writes,
                         log_public v2, eval flag, no hat updates + private contact email, log flood guard, eval reset
  functions/
    _shared/             domain.ts, tools.ts (+ tools/: context, schemas, read, propose), agent.ts, apply.ts,
                         concierge.ts, llm.ts, http.ts, log.ts, ...
    workshop-agent/ apply-proposals/ concierge/
tests/                   Vitest: domain, tools, agent loop, edge helpers, UI logic
evals/                   cases.json + run.ts (calls the deployed functions)
scripts/                 logs.ts, seed-users.mjs, eval-reset.mjs, verify-security.mjs (npm run logs / seed:users / eval:reset / verify:security)
```

**The shared rules file.** [`supabase/functions/_shared/domain.ts`](../supabase/functions/_shared/domain.ts) has zero imports, so the same file runs in three places:

| Runtime | How it imports `domain.ts` | Example |
|---|---|---|
| Deno (Edge Functions) | relative path with extension | [tools.ts:12-35](../supabase/functions/_shared/tools.ts#L12-L35), [apply.ts:4-17](../supabase/functions/_shared/apply.ts#L4-L17) |
| Node (Next.js) | `@domain/*` path alias | [workshop/page.tsx:3](<../app/(app)/workshop/page.tsx#L3>), [eval-score.ts:2](../lib/admin/eval-score.ts#L2) |
| Vitest | same alias | [tests/domain.test.ts](../tests/domain.test.ts) |

The same pattern is used for `log-format.ts`, `pricing.ts`, `llm-types.ts`, `tools.ts`, `agent.ts`, `apply.ts` and `concierge.ts`: they import only other zero-npm-import files, so the agent loop and every guard are unit tested in Node with a fake model ([tests/tools.test.ts](../tests/tools.test.ts), [tests/edge-helpers.test.ts](../tests/edge-helpers.test.ts)). Only [llm.ts:9-15](../supabase/functions/_shared/llm.ts#L9-L15), [http.ts:5](../supabase/functions/_shared/http.ts#L5), [db.ts:4](../supabase/functions/_shared/db.ts#L4) and [log.ts:3](../supabase/functions/_shared/log.ts#L3) import `npm:` packages.

---

## 3. Data model

```mermaid
erDiagram
  workshops ||--o{ profiles : "has staff"
  workshops ||--o{ weavers : "works with"
  workshops ||--o{ hats : "owns records"
  weavers ||--o{ hats : "wove"
  hats ||--o{ hat_events : "append-only history"
  hats ||--o{ hat_flags : "anomalies"
  agent_runs ||--o{ proposals : "produced"
  agent_runs ||--o{ hat_events : "run_id when AI-proposed"
  profiles ||--o{ agent_runs : "user_id"
  workshops ||--o{ proposals : "scoped to"

  workshops { uuid id PK text name text city bool show_prices }
  profiles { uuid id PK "= auth.users.id" uuid workshop_id FK text role "member or admin" }
  weavers { uuid id PK uuid workshop_id FK text name text village bool show_name text bio }
  hats { uuid id PK text code UK "TQ-XXXXX" text grade int rows_per_inch smallint stage "0..4" text owner_type text transfer_email int version bool archived }
  hat_events { uuid id PK uuid hat_id FK text type smallint from_stage smallint to_stage text source "ai_proposal or manual" uuid run_id FK }
  hat_flags { uuid id PK uuid hat_id FK text kind text raised_by timestamptz reviewed_at }
  agent_runs { uuid id PK text agent text status jsonb steps int tokens_in int tokens_out numeric cost_usd text request_id }
  proposals { uuid id PK uuid run_id FK text type text status jsonb payload jsonb edits text quote text confidence jsonb rule_result }
  app_logs { bigint id PK text level text source text action text request_id uuid run_id jsonb payload jsonb error }
```

| Table | What matters | Code |
|---|---|---|
| `hats` | Code format, stage 0..4, rows 6..40, grade enum are CHECK constraints. Grade vs rows is **not** a constraint (D10). `version` for optimistic locking | [schema.sql:40-71](../supabase/migrations/20261019000001_schema.sql#L40-L71) |
| `hat_events` | `stage_advanced` must be exactly one step; append-only trigger | [schema.sql:73-86](../supabase/migrations/20261019000001_schema.sql#L73-L86), [schema.sql:256-275](../supabase/migrations/20261019000001_schema.sql#L256-L275) |
| `agent_runs` | `steps` jsonb is the full trace; tokens, latency, cost per run | [schema.sql:100-121](../supabase/migrations/20261019000001_schema.sql#L100-L121) |
| `proposals` | AI `payload` is never overwritten; human changes go to `edits` (D4) | [schema.sql:123-141](../supabase/migrations/20261019000001_schema.sql#L123-L141) |
| `app_logs` | No FKs on purpose; 32 KB payload check | [schema.sql:146-163](../supabase/migrations/20261019000001_schema.sql#L146-L163) |

### Main SQL functions

| Function | Security | Called by | Does | Code |
|---|---|---|---|---|
| `hats_guard` (trigger) | every writer | all hat writes | New user-created hats start at Weaving; archived hats are frozen; stage stays or moves +1; version always bumps | [schema.sql:209-247](../supabase/migrations/20261019000001_schema.sql#L209-L247) |
| `public_hat_passport(code)` | definer | passport page, concierge | Fixed public JSON. No uuids, `transfer_email`, owner ids, hidden price or hidden weaver name | [functions.sql:32-102](../supabase/migrations/20261019000003_functions.sql#L32-L102) |
| `save_agent_run(...)` | definer, service role only | `workshop-agent` | Final run row + all its proposals in one transaction | [functions.sql:515-552](../supabase/migrations/20261019000003_functions.sql#L515-L552) |
| `apply_proposal(...)` | definer, service role only | `apply-proposals` | Locks the proposal row, idempotent on `approved`, writes hats/events/flags. Latest body is in migration 5 | [0005:69-158](../supabase/migrations/20261019000005_fix_conflict_errcode.sql#L69-L158) (original [functions.sql:391-480](../supabase/migrations/20261019000003_functions.sql#L391-L480)) |
| `restore_proposal(id)` | definer, own workshop | proposal undo of a reject | Moves a rejected/dismissed card back to open (D4) | [functions.sql:487-507](../supabase/migrations/20261019000003_functions.sql#L487-L507) |
| `claim_hat(code)` | definer | claim dialog | Confirmed email must match `transfer_email`; one conditional update (D11) | [functions.sql:190-246](../supabase/migrations/20261019000003_functions.sql#L190-L246) |
| `advance_hat`, `create_hat`, `transfer_hat`, `archive_hat`, `mark_flag_reviewed` | definer, each checks `my_workshop_id()` | manual hat actions | Same rules for non-AI edits. Members have no direct insert or update on `hats` and no insert on `hat_events`, so these RPCs are the only manual write path | [0006:21-23](../supabase/migrations/20261019000006_definer_hat_writes.sql#L21-L23), [0006:29-187](../supabase/migrations/20261019000006_definer_hat_writes.sql#L29-L187) |
| `log_public(action, level, payload)` | definer, anon | logged-out logger | Allowlisted anonymous log rows (D6); identifying keys stripped at every depth | [0007:9-74](../supabase/migrations/20261019000007_log_public_v2.sql#L9-L74) (original [functions.sql:139-183](../supabase/migrations/20261019000003_functions.sql#L139-L183)) |
| `my_workshop_id()`, `is_admin()` | definer | RLS policies | Role helpers without policy recursion | [schema.sql:281-289](../supabase/migrations/20261019000001_schema.sql#L281-L289) |

Execute rights are revoked from everyone first, then granted one by one ([functions.sql:600-627](../supabase/migrations/20261019000003_functions.sql#L600-L627)).

---

## 4. Main flows

### 4a. Voice note to saved hat

```mermaid
sequenceDiagram
  autonumber
  actor S as Workshop staff
  participant B as Browser (Composer)
  participant WA as workshop-agent
  participant G as Gemini
  participant DB as Postgres
  participant AP as apply-proposals

  S->>B: tap mic, speak
  B->>B: Web Speech API, live words, low-confidence words marked
  B->>S: review transcript (edit a word or re-record)
  S->>B: Send
  B->>WA: POST {note, input_mode, hat_tag?} + JWT + x-request-id
  WA->>DB: auth, rate limit (20/h), insert agent_runs (running)
  loop up to 6 model calls, 45 s budget
    WA->>G: system prompt + note in <note> + 7 tool declarations
    G-->>WA: functionCall(s) or final text
    WA->>DB: read tools (user JWT, RLS, workshop filter)
    WA->>WA: propose tools: quote check, grounding, domain.ts rules, buffer proposal
  end
  WA->>DB: save_agent_run (steps, tokens, cost, proposals) in one transaction
  WA-->>B: {run_id, summary, proposals} (+ meta for admins only)
  S->>B: approve / edit / reject each card
  B->>B: hold approvals 10 s (Undo)
  B->>AP: POST {decisions[]} + JWT
  AP->>DB: load proposals + fresh hat/weaver rows
  AP->>AP: validateApproval (domain.ts) on the fresh row
  AP->>DB: apply_proposal (lock, version check, write hats + hat_events)
  AP-->>B: {results[]} approved / blocked / failed
```

| Step | Code |
|---|---|
| Speech recognition, `es-EC` default, interim results | [useSpeechRecognition.ts:87-89](../lib/voice/useSpeechRecognition.ts#L87-L89), [reducer.ts:147](../lib/voice/reducer.ts#L147) |
| Recording ends in a `review` phase, never auto-sends; Send only for 1 to 1000 chars | [reducer.ts:210-240](../lib/voice/reducer.ts#L210-L240), [reducer.ts:157-160](../lib/voice/reducer.ts#L157-L160) |
| Generic timed progress steps, no invented specifics (D13) | [reducer.ts:16-23](../lib/voice/reducer.ts#L16-L23) |
| Validate, rate limit, insert running run | [workshop-agent/index.ts:41-100](../supabase/functions/workshop-agent/index.ts#L41-L100) |
| Loop | [agent.ts:198-377](../supabase/functions/_shared/agent.ts#L198-L377) |
| Save run and proposals atomically | [workshop-agent/index.ts:147-159](../supabase/functions/workshop-agent/index.ts#L147-L159) |
| Cost and tokens only for admins (D8) | [workshop-agent/index.ts:238-249](../supabase/functions/workshop-agent/index.ts#L238-L249) |
| 10 s undo queue, flush on hidden tab or page close | [queue.ts](../lib/workshop/queue.ts), [useProposals.ts:179-222](../components/workshop/useProposals.ts#L179-L222), [api.ts:117-139](../lib/workshop/api.ts#L117-L139) |
| Re-check and write | [apply.ts:274-441](../supabase/functions/_shared/apply.ts#L274-L441) |

### 4b. Buyer opens a passport and asks a question

```mermaid
sequenceDiagram
  autonumber
  actor V as Visitor (anonymous)
  participant P as /hat/[code] (server)
  participant DB as Postgres
  participant CO as concierge
  participant G as Gemini

  V->>P: GET /hat/TQ-9A1M8
  P->>DB: rpc public_hat_passport(code) (anon or user session)
  DB-->>P: public JSON or null (Not verified)
  P->>DB: log_passport_view (after response)
  P-->>V: certificate, weaver, timeline
  V->>CO: POST {code, messages} (no JWT needed)
  CO->>CO: off-topic gate (code, poems, trivia get fixed copy, no model call)
  CO->>DB: rate limits (counts app_logs by ip hash, 503 if the count fails)
  CO->>DB: rpc public_hat_passport with the anon key
  CO->>CO: toConciergeRecord, escape, wrap in tags
  CO->>G: one call, no tools, JSON schema
  G-->>CO: {kind, lang, answer, sources}
  CO->>CO: finalizeAnswer: fixed copy, leak guard, topic and number checks, drop ungrounded sources
  CO->>DB: one agent_runs row (answered, refused or failed) + app_logs
  CO-->>V: {answer, sources, refused?}
```

Code: [lib/passport/server.ts:18](../lib/passport/server.ts#L18) (page read), [concierge/index.ts:99-158](../supabase/functions/concierge/index.ts#L99-L158) (limits, record, model call), [concierge.ts:475-507](../supabase/functions/_shared/concierge.ts#L475-L507) (grounding).

### 4c. Claim

```mermaid
sequenceDiagram
  autonumber
  actor W as Workshop member
  actor Bu as Buyer
  participant DB as Postgres
  W->>DB: transfer_hat(code, version, 'buyer', email)
  Note over DB: transfer_email set, so the workshop's advance, transfer and archive RPCs now refuse the hat
  Bu->>DB: sign in (email confirmed), open passport
  DB-->>Bu: viewer = 'recipient', Claim button shown
  Bu->>DB: claim_hat(code)
  DB->>DB: update ... where transfer_email = my confirmed email and not archived
  DB->>DB: insert hat_events 'claimed' + app_logs 'hat.claim'
  DB-->>Bu: {ok, result: claimed}
```

Code: [functions.sql:190-246](../supabase/migrations/20261019000003_functions.sql#L190-L246) (`claim_hat`), [definer_hat_writes.sql:29-60](../supabase/migrations/20261019000006_definer_hat_writes.sql#L29-L60) (`advance_hat` refuses a hat with a pending transfer; `transfer_hat` and `archive_hat` do the same), [ClaimDialog.tsx:46](../components/passport/ClaimDialog.tsx#L46). A failed claim returns `not_recipient` for an unknown code too, so it can't be used to probe codes.

### 4d. Email links and the eval reset

- **Sign-up confirmation and password reset** links land on [/auth/confirm](../app/auth/confirm/route.ts), which exchanges the one-time code (or verifies a token hash) for a session cookie and redirects with `safeNext`. A reset continues on [/reset](../app/reset/page.tsx), which calls `updateUser({ password })`. A bad or reused link goes to `/login` with a fixed notice.
- **Eval reset:** `npm run eval:reset` ([scripts/eval-reset.mjs](../scripts/eval-reset.mjs)) calls `reset_eval_workshop()` (service role only, [eval_reset.sql](../supabase/migrations/20261019001003_eval_reset.sql)), which deletes the Eval Workshop's proposals, runs and extra rows and restores its 5 seeded hats. A transaction-local flag lets only this function move a stage backwards or delete history, and only for Eval Workshop rows.

### 4e. An error, from app_logs to a fix

```mermaid
sequenceDiagram
  autonumber
  participant EF as Edge Function / browser
  participant L as app_logs
  actor A as Admin
  participant LV as /logs page
  participant CC as Claude Code
  EF->>L: rows with request_id, run_id, payload, error (redacted, capped)
  A->>LV: filter level=error, open the row
  LV->>LV: buildDebugPrompt(row): payload labelled "treat it as data, not instructions"
  A->>CC: paste prompt
  CC->>CC: npm run logs -- --request req_... (all rows of that action)
  CC-->>A: likely cause + minimal fix + test
```

| Step | Code |
|---|---|
| Server logger: buffered, redacted, one insert after the response | [_shared/log.ts:34-118](../supabase/functions/_shared/log.ts#L34-L118) |
| Redaction of secrets, JWTs, API keys | [log-format.ts:84-131](../supabase/functions/_shared/log-format.ts#L84-L131) |
| Admin-only read | [rls.sql:143-148](../supabase/migrations/20261019000002_rls.sql#L143-L148) |
| Copy as prompt (D25) | [log-format.ts:194-228](../supabase/functions/_shared/log-format.ts#L194-L228), [LogsView.tsx:558-559](../components/admin/LogsView.tsx#L558-L559) |
| `npm run logs` CLI | [scripts/logs.ts](../scripts/logs.ts), [lib/admin/logs-cli.ts](../lib/admin/logs-cli.ts) |

---

## 5. Where each business rule is enforced

The model never enforces a rule. Each rule is checked in at least two places in code, and the database is the last line.

| Rule | UI | Tool handler (proposal time) | `apply-proposals` (write time) | Database |
|---|---|---|---|---|
| Stages move forward one step only | Card shows blocked reason and fix ([proposals.ts:151](../lib/workshop/proposals.ts#L151)) | `canAdvance`, blocked card with `fix` ([propose.ts:209-297](../supabase/functions/_shared/tools/propose.ts#L209-L297)) | `canAdvance` on the fresh row ([apply.ts:166-185](../supabase/functions/_shared/apply.ts#L166-L185)) | no update grant on `hats` for members ([hat_grants_contact_email.sql:19](../supabase/migrations/20261019001001_hat_grants_contact_email.sql#L19)); `where to_stage = stage + 1` ([0005:127-128](../supabase/migrations/20261019000005_fix_conflict_errcode.sql#L127-L128)), `hats_guard` ([schema.sql:236-238](../supabase/migrations/20261019000001_schema.sql#L236-L238)), `hat_events_one_step` ([schema.sql:85](../supabase/migrations/20261019000001_schema.sql#L85)) |
| Grade must match rows per inch (new writes) | Draft check in edit form ([proposals.ts:485](../lib/workshop/proposals.ts#L485)) | `gradeMismatch`, blocked with fix grade ([propose.ts:168-184](../supabase/functions/_shared/tools/propose.ts#L168-L184)) | Re-checked ([apply.ts:142-150](../supabase/functions/_shared/apply.ts#L142-L150)) | Not enforced on purpose (D10); `create_hat` RPC blocks it for manual creates |
| Only the owner changes a hat | Owner-only buttons | `canAdvance` -> `not_owner` ([domain.ts:142-166](../supabase/functions/_shared/domain.ts#L142-L166)) | Pending transfer treated as not owner ([domain.ts:161-163](../supabase/functions/_shared/domain.ts#L161-L163), run on the fresh row by [apply.ts](../supabase/functions/_shared/apply.ts)) | No client update on `hats` ([hat_grants_contact_email.sql:19](../supabase/migrations/20261019001001_hat_grants_contact_email.sql#L19)); definer RPCs check the owner; `apply_proposal` where clause |
| New hats start at Weaving (D15) | | Payload has no stage | | `hats_guard` insert branch ([schema.sql:211-225](../supabase/migrations/20261019000001_schema.sql#L211-L225)); `apply_proposal` inserts stage 0 |
| Quantity 1 to 20, rows 6 to 40 | Edit form limits | [propose.ts:138-149](../supabase/functions/_shared/tools/propose.ts#L138-L149) | [apply.ts:140-147](../supabase/functions/_shared/apply.ts#L140-L147) | `quantity_range` in `apply_proposal`; `hats_rows_range` check |
| No concurrent overwrite | Failed card "Someone may have updated this hat" | Proposal stores `expected_version` | Version compare ([apply.ts:167-176](../supabase/functions/_shared/apply.ts#L167-L176)) | `where version = v_version` ([0005:127](../supabase/migrations/20261019000005_fix_conflict_errcode.sql#L127)) |
| History is append-only | | | | Trigger ([schema.sql:256-275](../supabase/migrations/20261019000001_schema.sql#L256-L275)); no update/delete grant ([rls.sql:50](../supabase/migrations/20261019000002_rls.sql#L50)) |
| Members never see logs, runs, cost | Admin pages show "for admins" card ([logs/page.tsx](<../app/(app)/logs/page.tsx>)) | | | RLS `is_admin()` ([rls.sql:129-130](../supabase/migrations/20261019000002_rls.sql#L129-L130), [rls.sql:143-144](../supabase/migrations/20261019000002_rls.sql#L143-L144)); `meta` omitted server-side (D8) |
| Clients never write proposals or runs (D4, D5) | | | Service role only | No insert/update grant ([rls.sql:36-38](../supabase/migrations/20261019000002_rls.sql#L36-L38)) |
| Claim needs the confirmed matching email (D11) | Claim button only for `recipient` | | | `claim_hat` ([functions.sql:213-226](../supabase/migrations/20261019000003_functions.sql#L213-L226)) |

---

## 6. Key decisions and trade-offs

Full list: README [decision log](../README.md#7-decision-log) and [conventions section 8](specs/00-conventions.md#8-decisions-after-spec-review-these-override-sections-1-to-7-and-any-spec) (D1 to D25) plus [section 9](specs/00-conventions.md#9-model-provider-change-d26-overrides-section-5-d8-cost-numbers-d16-and-d17) (D26).

| Decision | Why | Cost of the choice |
|---|---|---|
| **Supabase, not Firebase** | Auth, Postgres, RLS and Edge Functions in one free tier. Relational data fits hats, history and logs; `app_logs` is plain SQL to debug; roles are RLS, not custom claims | Deno for server code; a second runtime next to Node (solved by the zero-import shared files) |
| **Edge Functions, not Next.js API routes** | The service role key and the Gemini key never reach Vercel (D6, D24). Agent writes use the service role inside Supabase only | Two deploy targets; local dev needs `supabase functions serve` |
| **One JSON response, no streaming (D13)** | Simple and honest: the UI shows generic timed steps and never invents what the agent is doing ([reducer.ts:16-23](../lib/voice/reducer.ts#L16-L23)) | The user waits for the full run. Streaming real steps is a next step (section 7) |
| **Client-side 10 s undo (D14)** | Undo must never mean a backward stage move or deleting append-only history. So nothing is sent until the window ends ([queue.ts:5](../lib/workshop/queue.ts#L5)) | Approvals are lost if the browser dies before the flush; mitigated with a `keepalive` fetch on hide/close ([api.ts:117-139](../lib/workshop/api.ts#L117-L139)) and an idempotent server |
| **Rules in code, not prompts** | `domain.ts` is pure and unit tested ([tests/domain.test.ts](../tests/domain.test.ts)); the prompt says "Code checks every stage and grade rule" ([agent.ts:27](../supabase/functions/_shared/agent.ts#L27)) | Rules exist in TS and partly in SQL (the database mirrors the critical ones) |
| **Voice in the browser (Web Speech API)** | Free, live transcript, no audio stored by us, fits the timebox | Chrome/Edge only; audio goes to the browser vendor (copy says so, D19); accuracy limited, so the transcript review step and fuzzy code matching exist |
| **Gemini Flash-Lite (D26)** | Cheap and fast for a voice-first phone flow | Weaker multi-step tool use, so guardrails and evals matter more ([AI.md section 6](AI.md#6-model-choice)) |

---

## 7. How to extend

| Follow-up ask | Concrete steps |
|---|---|
| **WhatsApp intake** | 1. New Edge Function `whatsapp-webhook` (verify the Meta signature). 2. Map the sender phone to a profile (new `profiles.phone` column, unique). 3. Transcribe voice notes server-side (WhatsApp sends audio files, no browser). 4. Reuse `createRunContext` + `runAgentLoop` + `save_agent_run` exactly as [workshop-agent/index.ts:102-159](../supabase/functions/workshop-agent/index.ts#L102-L159) with `input_mode: "voice"`. 5. Reply with a link to `/workshop` to approve. Proposals still need a human tap; never auto-approve from chat. |
| **Phone login** | Turn on Supabase phone OTP; add `phone` to `profiles`; extend `handle_new_user` ([schema.sql:295-318](../supabase/migrations/20261019000001_schema.sql#L295-L318)). `claim_hat` matches on email today (D11), so a phone claim needs its own matching rule. |
| **QR codes** | Generate on the hat detail page with a QR library pointing at `/hat/<code>?via=qr`. `via=qr` is already accepted and logged ([code.ts:41-48](../lib/passport/code.ts#L41-L48), [functions.sql:126](../supabase/migrations/20261019000003_functions.sql#L126)). |
| **Streaming steps** | Return an SSE stream from `workshop-agent`: emit each `pushStep` ([context.ts:210-212](../supabase/functions/_shared/tools/context.ts#L210-L212)) as it happens, keep `save_agent_run` at the end. On the client replace the timed steps in [reducer.ts:16-23](../lib/voice/reducer.ts#L16-L23) with the real ones. Watch the Edge Function wall clock. |
| **Multiple workshops per user** | Today one `profiles.workshop_id` drives every policy through `my_workshop_id()` ([schema.sql:281-284](../supabase/migrations/20261019000001_schema.sql#L281-L284)). Add a `memberships(user_id, workshop_id, role)` table, a "current workshop" claim or header, and change `my_workshop_id()` to read it. Policies don't change shape. |
| **Switch model provider** | Write a new `generate()` with the same `GenerateArgs` / `GenerateResult` shape ([llm-types.ts:38-66](../supabase/functions/_shared/llm-types.ts#L38-L66)) and swap the import in [llm.ts](../supabase/functions/_shared/llm.ts). Map the provider's finish reasons to `STOP` / `MAX_TOKENS` / refusal ([llm-types.ts:68-81](../supabase/functions/_shared/llm-types.ts#L68-L81)), update [pricing.ts](../supabase/functions/_shared/pricing.ts), then run `npm run eval`. The loop and tools don't change. |
| **A new rule** | Add a pure function to `domain.ts` with tests, call it in the tool handler (blocked card) and in `validateApproval`, and mirror it in SQL only if bad data must never exist. |

---

## 8. Not implemented yet

| Item | Status |
|---|---|
| Streaming agent progress | Not built (D13). Steps are generic and timed |
| WhatsApp intake, phone login, QR images, transfer emails, multi-workshop | Not built (README "Cut on purpose") |
| Dedicated `rate_limits` table | Limits count `app_logs` rows ([concierge/index.ts:39-50](../supabase/functions/concierge/index.ts#L39-L50)) and `agent_runs` rows ([workshop-agent/index.ts:65-76](../supabase/functions/workshop-agent/index.ts#L65-L76)) |
| SQL tests for RLS | Not built; RLS is checked live by `npm run verify:security` ([SECURITY.md section 12](SECURITY.md#12-how-to-verify-yourself)) |
| Component and end-to-end tests | Not built ([ENGINEERING.md section 11](ENGINEERING.md#11-known-gaps-and-next-steps)) |
