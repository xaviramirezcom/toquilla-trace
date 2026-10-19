# Edge Functions (Toquilla Trace)

Three Supabase Edge Functions (Deno) hold all server logic that touches the model or writes hats:

| Function | Auth | Job |
|---|---|---|
| `workshop-agent` | member or admin JWT | One workshop note in, proposals out. Gemini tool loop, rules in code, nothing written to hats |
| `apply-proposals` | member or admin JWT | Human approve / reject. Re-checks rules on fresh rows, then writes through `apply_proposal()` |
| `concierge` | anonymous (`verify_jwt = false`) | Read-only Q&A about one hat on the public passport. No tools |

Model: Google Gemini `gemini-2.5-flash-lite` (decision D26), called only from these functions.

## Files

| Path | What it is |
|---|---|
| `supabase/functions/_shared/http.ts` | CORS, JSON helpers, error shape, request id, `authenticate()` (JWT checked with the anon key, profile loaded with the service role), Supabase clients |
| `supabase/functions/_shared/log.ts` | Buffered server logger: rows are kept per request, written with one insert at the end (retried once), and mirrored to `console.log`. Never throws. `flushInBackground()` uses `EdgeRuntime.waitUntil` |
| `supabase/functions/_shared/llm.ts` | Thin Gemini adapter, the only file importing `npm:@google/genai@2.27.0` |
| `supabase/functions/_shared/llm-types.ts` | Provider-neutral types (`GenerateArgs`, `GenerateResult`), refusal finish reasons. Zero imports |
| `supabase/functions/_shared/tools.ts` | The 7 tool declarations and their handlers, run context, steps. Imports only `domain.ts`, `log-format.ts`, `llm-types.ts` (Node testable, linted) |
| `supabase/functions/_shared/agent.ts` | Workshop system prompt, user message builder, the manual loop (`runAgentLoop`) with an injected `generate()` |
| `supabase/functions/_shared/db.ts` | Supabase `DataLayer` for the tools: user client (RLS) plus an explicit `workshop_id` filter on every query |
| `supabase/functions/_shared/apply.ts` | `mergeEdits` (whitelist) and `validateApproval` (re-check on fresh rows). Pure |
| `supabase/functions/_shared/concierge.ts` | Concierge system prompt, JSON schema, `toConciergeRecord`, `buildUserContent`, `validateRequest`, `finalizeAnswer` (grounding and leak check). Pure |
| `supabase/functions/{workshop-agent,apply-proposals,concierge}/index.ts` | The handlers |
| `tests/tools.test.ts`, `tests/tools-fixtures.ts`, `tests/edge-helpers.test.ts` | Vitest: handlers against an in-memory data layer, loop with a scripted fake model, concierge and apply helpers |
| `evals/cases.json` | 17 workshop cases (Eval Workshop codes) and 15 concierge cases for `npm run eval` |

## Gemini API (verified, not guessed)

The docs pages for function calling and structured output now show the newer Interactions API, so the `generateContent` shapes were verified against the published `@google/genai` package types (v2.27.0, `dist/genai.d.ts`):

- `new GoogleGenAI({ apiKey })`, `ai.models.generateContent({ model, contents, config })`.
- `config.systemInstruction`, `config.tools: [{ functionDeclarations: [{ name, description, parametersJsonSchema }] }]`, `config.toolConfig.functionCallingConfig.mode = "AUTO"`.
- Structured output: `config.responseMimeType = "application/json"` plus `config.responseJsonSchema` (supports `type`, `enum`, `items`, `properties`, `required`, `anyOf`, `propertyOrdering`).
- `config.maxOutputTokens`, `config.temperature`, `config.thinkingConfig.thinkingBudget`, `config.abortSignal`, `config.httpOptions.timeout` (ms) and `httpOptions.retryOptions { attempts, initialDelay (s) }` (no retries unless set). We do not use SDK retries: `callWithRetry` in `_shared/llm-types.ts` makes at most one retry, only on HTTP 429 or 5xx, and only when it still fits before the run deadline (`deadlineAt`); each attempt's timeout is capped at the time left.
- Response: `candidates[0].content.parts[]` (`text`, `functionCall { id?, name, args }`, `thought`, `thoughtSignature`), `candidates[0].finishReason` (`STOP`, `MAX_TOKENS`, `SAFETY`, `MALFORMED_FUNCTION_CALL`, ...), `promptFeedback.blockReason`, `usageMetadata` (`promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`, `cachedContentTokenCount`), `modelVersion`. Errors are `ApiError { status }`.
- The model turn is appended to the history exactly as returned (keeps thought signatures); all `functionResponse` parts of a turn go back in one `user` turn.

## Contracts

All requests send `x-request-id: req_<12 hex>` (a fresh one is generated when missing or malformed; the bad value is logged as `client_request_id`). Every response carries the `x-request-id` header. Errors are `{ error: { code, message, request_id } }`.

### `POST /functions/v1/workshop-agent`

Request `{ note: string (1..1000 after trim), input_mode: "voice" | "typed", hat_tag?: "TQ-XXXXX" }`.

Response 200:

```json
{ "run_id": "uuid", "summary": "I understood: ...",
  "proposals": [ { "id": "uuid", "type": "create_hat|advance_stage|flag_issue",
                   "status": "pending|question|blocked", "payload": {}, "why": "...",
                   "quote": "...", "confidence": "high|check", "rule_result": {} } ],
  "meta": { "tool_calls": 8, "model_calls": 3, "latency_ms": 4300, "tokens_in": 9000, "tokens_out": 300, "cost_usd": 0.001, "model": "gemini-2.5-flash-lite" } }
```

`meta` is present only for admins (D8, decided on the server).

Errors: 400 `invalid_input`, 401 `unauthorized`, 403 `no_workshop`, 429 `rate_limited` (20 runs per user per hour, counted on `agent_runs`), 502 `model_error` (API error, `SAFETY` or other refusal finish reasons, `MAX_TOKENS` with nothing prepared), 504 `timeout` (45 s run budget), 499 `stopped` (client disconnected), 500 `internal`. 502, 504 and 499 bodies also carry `run_id`.

Payloads (what the UI and `apply_proposal()` read):

| type | payload |
|---|---|
| `create_hat` | `{ weaver_id, weaver_name, quantity, grade, rows_per_inch, straw }` (grade derived from rows when the note does not say it) |
| `advance_stage` | `{ hat_id, hat_code, code_heard, match: "exact"\|"confusable"\|"fuzzy", from_stage, to_stage, from_stage_name, to_stage_name, hat_version, expected_version }` (stages are indexes 0..4) |
| `flag_issue` | `{ hat_id, hat_code, kind, message }` |
| any type with `status = "question"` | the draft fields of that type (nullable) plus `question: { text, choices: [{ label, weaver_id, hat_code }] }`; `create_hat` questions also carry `weaver_candidates: [{ id, name, village }]` and `weaver_id: null`. Choice labels are built from records ("Rosa Pillco (Sígsig)"), never from model text |

`rule_result`: `{ allowed, code, message, fix, warnings, warning_messages?, confirmed_by_record?, checked_at }`. `fix` is `{ to_stage, to_stage_name }` for `stage_skip` and `{ grade }` for `grade_mismatch`. Warnings: `too_fast`, `open_proposal_exists`, `not_confirmed_by_record`, `grade_mismatch` (question draft).

### `POST /functions/v1/apply-proposals`

Request `{ decisions: [{ proposal_id: uuid, action: "approve" | "reject", edits?: object }] }` (1 to 50, unique ids).
Response 200 `{ results: [{ proposal_id, status: "approved"|"rejected"|"dismissed"|"blocked"|"failed", error?: { code, message }, hat_codes?: string[] }] }`. 400 `invalid_request`, 401 `unauthorized`, 500 `internal`.

- Edit whitelist: `create_hat`: `quantity, grade, rows_per_inch, weaver_id, straw`; `advance_stage`: `to_stage` (index or stage name), `expected_version`, `hat_code`; `flag_issue`: `message`, `hat_code`. `hat_code` is accepted only on a question card that has no hat yet; the hat is then loaded fresh and its current version is used. Anything else returns `invalid_edits` and writes nothing.
- Approve is allowed from `pending`, `question` (after the person picks a weaver, sent as `edits.weaver_id`), `blocked` (after a fix edit) and `failed` (retry). Approving an approved proposal returns `approved` and writes nothing. Approving a rejected or dismissed one returns `failed` `not_open`.
- Reject stores `dismissed` for a blocked card and `rejected` otherwise; repeating it is idempotent.
- Rule failures at approval set the proposal to `blocked` with a fresh `rule_result` (`phase: "apply"`); a version conflict sets it to `failed`.
- Another workshop's proposal returns `not_found` (also for admins).
- Codes for new hats are generated in SQL (`p_codes = null`).

### `POST /functions/v1/concierge`

Request `{ code, messages: [{ role: "user"|"assistant", content }] }` (last message from the user, at most 8 user turns, questions 1..300 chars, assistant turns up to 1200 chars, 16 messages).
Response 200 `{ answer, sources: [{ kind: "record", field } | { kind: "general" }], refused?: true }`.
Errors: 400 `invalid_request`, 404 `hat_not_found`, 429 `rate_limited` (9th user turn, 5 answers per minute or 60 per day per IP hash), 503 `concierge_paused` (`CONCIERGE_DAILY_MAX`, default 500 per UTC day), 502 `model_error`, 500 `internal`.

- The record is read through `public_hat_passport` with the anon key and no user session, so the model sees exactly what a visitor sees. Contact email, viewer and ids never reach the model.
- No tools. JSON output with a schema, `thinkingBudget: 0`, temperature 0.2.
- `finalizeAnswer` in code: change requests return the fixed "I can only read this hat's record, not change it." (EN/ES) with `refused: true`; unknown and off-topic return the fixed unknown copy; any answer containing the canary, an email address or prompt section names is replaced (leak guard); `record` sources for fields the record does not have are dropped, and an answer with no surviving source becomes the unknown copy.
- Rate limits count `concierge.message` / `concierge.refused` rows in `app_logs` by `payload.ip_hash`. If the count query fails, limits fail open.

## Workshop agent design

- **Loop:** at most 6 model calls, 45 s budget, 25 s per call, `maxOutputTokens` 4096, temperature 0, mode `AUTO`. Finish reasons: `SAFETY`, `RECITATION`, `BLOCKLIST`, `PROHIBITED_CONTENT`, `SPII`, a blocked prompt or no candidate fail the run (nothing saved). `MAX_TOKENS` keeps complete proposals with a code summary, or fails if there are none. `MALFORMED_FUNCTION_CALL` (and `UNEXPECTED_TOOL_CALL`) gets a "call again" user turn each time it happens; the 6-call cap and the 45 s deadline bound how many.
- **One recovery nudge per run:** Flash-Lite sometimes proposes before looking up (the handler refuses), or stops with an empty reply. The loop then sends one extra user turn ("look up first, then propose", or for an empty reply "If the note describes events, call the propose functions for each event; otherwise reply with a short summary."). Never sent after a clean finish.
- **Summary format is checked in code:** it must start with "I understood:" and have at most 2 sentences; otherwise the code-written summary is used (`usedFallback`).
- **Hats named only by weaver:** `find_hats` by weaver marks the whole group. If the weaver has more than one matching hat, `propose_advance_stage` returns `{ ok: false, error_code: "ambiguous_hats", candidates }` and the model must ask; `propose_flag` is allowed only when that hat's own record confirms the issue. `record_issues` in `find_hats` shows record-only issues (grade vs rows); `too_fast` needs events and is reported by `get_hat` and checked by `propose_flag`.
- **Concierge runs:** every concierge answer after the hat is loaded writes one `agent_runs` row (`agent = concierge`, status `answered`, `refused` or `failed`, tokens, cost, latency, model, request id, hat code; no question, answer, IP or user).
- **Rules in code:** quote must appear in the note (`quoteInNote`); weaver ids and hat codes must come from a read tool in the same run (or the hat tag); a weaver returned by an ambiguous `find_weaver` (2 or more matches) can't be used for `propose_create_hats` (the model must ask); `canAdvance` decides blocked vs pending; `same_stage` is an error; grade vs rows blocks creates; at most 10 proposals; duplicates rejected; an open flag of the same kind is rejected.
- **Injection guard in code:** `find_hats` needs a filter; a hat found only by `stage` can't be acted on; a hat found by code is actionable only if that code appears in the note, and a hat found by weaver only if the weaver name appears in the note.
- **Persistence:** the run row is inserted first (`running`), then `save_agent_run()` stores status, steps, totals and proposals in one transaction. Failed and stopped runs save no proposals.
- **Steps (`agent_runs.steps`):** `model_call` (`iteration, stop_reason` = Gemini finish reason, `text, tokens_in, tokens_out, cache_read, duration_ms, model, function_calls`), `tool_call` (`name` and `tool`, `access: "read" | "write_proposed"`, `input`, `output`, `is_error`, `duration_ms`), `rule_check` (`rule: canAdvance | gradeMismatch | detectAnomalies`, `hat_code, allowed, code, message, reason`), `proposal` (`temp_id, proposal_id` (temp), `type, status, summary`), `error` (`code, message, error`). Each has `i` and `at`. Fields over 4 KB are truncated.
- **Logs (`app_logs`, source `edge:workshop-agent`):** `agent.run.start`, one `agent.model.call` per call, one `agent.tool.call` per tool, one `agent.rule.check` per rule check, then `agent.run.end` or `agent.run.error`, all with the same `request_id` and `run_id`. Validation and auth failures log `agent.run.error` at `warn`.

## Environment

| Variable | Where | Notes |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | injected by Supabase | Service role used only for logs, runs, rate-limit counts, profile load and the apply RPC |
| `GEMINI_API_KEY` | Supabase secret | Never logged |
| `GEMINI_MODEL` | Supabase secret (optional) | Default `gemini-2.5-flash-lite` |
| `ALLOWED_ORIGINS` | Supabase secret (optional) | Comma-separated origins, for example `https://<app>.vercel.app,http://localhost:3000`. Default `*` for the demo. Localhost origins are always echoed back when a list is set |
| `RATE_SALT` | Supabase secret (recommended) | Salt for the concierge IP hash. If unset, the service role key is used as the salt (still secret, never logged) |
| `CONCIERGE_DAILY_MAX` | Supabase secret (optional) | Global concierge answers per UTC day, default 500 |

## Deploy

```bash
npx --yes supabase@2.121.0 functions deploy workshop-agent apply-proposals concierge \
  --project-ref mflvsnpyckuwhicvgnsr --use-api
```

`--use-api` bundles on the server, so Docker is not needed. Type check locally with `npx --yes deno@2.5.4 check --no-config supabase/functions/*/index.ts`.

## Smoke test results (2026-10-18, deployed project)

Run as the demo member against Taller Pillco (proposals were rejected afterwards through the reject path, nothing approved):

- **Sample note** (2 runs, same result both times, about 4.3 to 5.4 s, 3 model calls, 8 tool calls): `create_hat` question (choices "Rosa Pillco (Sígsig)" and "Rosa Guamán (Cuenca)", draft 3 Fino 18, quote "Doña Rosa terminó 3 finos de 18 hileras."), `advance_stage` TQ-7F3K2 to Bleaching pending (quote "El TQ-7F3K2 ya está lavado, pasa a blanqueo."), `advance_stage` TQ-2C5P0 to Finished blocked `stage_skip` ("Can't move TQ-2C5P0 from Weaving to Finished. Next allowed stage: Washing."). The fourth card (flag TQ-4K9D1) is refused in code because the seed already has an open `grade_mismatch` flag on TQ-4K9D1; the summary says so. With that seed flag reviewed or absent, the flag proposal is created (unit test "sample note flow").
- Misheard codes ("TQ-2C5PO", "TQ-7F3KZ"): both pending, `confidence: check`, `code_heard` set (after the recovery nudge; the first try proposed before looking up and was refused).
- "Manuel terminó 2 superfinos de 20 hileras": blocked `grade_mismatch`, "20 rows/inch usually means Fino.".
- "El TQ-8B2N4 regresa a tejido": blocked `backward`.
- "Rosa entregó 2 sombreros standard de 12 hileras": question with both Rosas, draft 2 Standard 12.
- English note (Carmen 2 Fino 16 rows, TQ-8B2N4 to bleaching): 2 pending.
- Injection note: 0 proposals, 1 model call, summary says it ignored the request.
- "Mañana el TQ-7F3K2 va a blanqueo" and "eh... ya, ok, gracias": 0 proposals.
- Admin run: `meta` present (`tokens_in` 2716, `tokens_out` 22, `cost_usd` 0.00028 for a 1-call run). Member runs: no `meta`.
- `app_logs` for the sample run: `agent.run.start` 1, `agent.model.call` 3, `agent.tool.call` 8, `agent.rule.check` 2, `agent.run.end` 1.
- `apply-proposals`: 17 open proposals rejected (12 `rejected`, 5 `dismissed`), replay returned the same statuses (idempotent), approving a rejected one returned `failed` `not_open`, a bad body returned 400, an unknown id returned `not_found`.
- Concierge on TQ-9A1M8: "Is this hat real?" answered with Taller Pillco, finish date 2026-10-02, tag check, source `verification` (about 1.3 s). "Mark this as mine" returned the fixed change copy with `refused: true`. Spanish question answered in Spanish (Manuel Delgado). Price, prompt leak, buyer identity: fixed unknown copy. 60 cm head: "may be too small", source `size`. Care: source `general`. 9 user turns: 429. Each answer wrote one `concierge.message` or `concierge.refused` row with `ip_hash`, tokens and cost.

## Known limitations

- **Flash-Lite and tool use:** it sometimes skips lookups or stops with an empty reply; the code refuses the bad calls and one nudge recovers most runs. Summaries that break the format are replaced by the code summary, which is plainer (it does not repeat what the model said it ignored).
- **Duplicate flags:** the agent never proposes a flag that already exists open. Migration 8 marks the Eval Workshop's seeded flag on TQ-E4K9D as reviewed, so the canonical eval can produce its flag card; the demo hat TQ-4K9D1 keeps its open flag.
- **Approve path** was not exercised against live data in the smoke test (demo data must stay clean). The Eval Workshop user (`scripts/seed-users.mjs`) now exists for evals. It is covered by unit tests of `mergeEdits` / `validateApproval` and by the SQL function's own checks.
- **No prompt caching:** the system prompt and tools are stable and first, so Gemini implicit caching can apply, but nothing is configured; cost is tiny anyway (about $0.001 per sample run).
- **Gateway 401:** requests with no `Authorization` header to the two JWT functions are rejected by the Supabase gateway with its own body (`UNAUTHORIZED_NO_AUTH_HEADER`), not our error shape.
- **Concierge limits** depend on `app_logs` inserts (written after the response), so a burst can slip one or two over the per-minute limit; spec 07 eval cases 9 (planted bio) and 16 (visible price) need fixture records and are covered only by unit tests of the grounding check.
