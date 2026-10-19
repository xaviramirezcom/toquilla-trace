# Database notes (schema, RLS, functions, demo seed)

Supabase project ref `mflvsnpyckuwhicvgnsr`. Specs: `docs/specs/00-conventions.md` sections 3, 8 and 9 win over the feature specs. This file lists what was built and every place it differs from a spec.

## Migrations

| File | What it does |
|---|---|
| `20261019000001_schema.sql` | 9 tables, check constraints, indexes, `grade_for_rows`, `hats_guard` trigger, append-only trigger on `hat_events`, `my_workshop_id()`, `is_admin()`, auth sign-up trigger |
| `20261019000002_rls.sql` | RLS on every table, policies, explicit table and column grants |
| `20261019000003_functions.sql` | All RPCs and their execute grants |
| `20261019000004_demo_seed.sql` | Idempotent demo data (fixed UUIDs, `on conflict do nothing`) |
| `20261019000005_fix_conflict_errcode.sql` | Fix-up: `version_conflict` no longer uses SQLSTATE 40001 (see Deviations) |

## Tables

`workshops`, `profiles`, `weavers`, `hats`, `hat_events`, `hat_flags`, `agent_runs`, `proposals` (with `edits jsonb`, D4), `app_logs`. Columns follow conventions section 3.

Main constraints:
- `hats`: code `^TQ-[A-Z0-9]{5}$`, stage 0..4, rows 6..40, grade enum, owner enum, `owner_user_id` null while the workshop owns it, size 52..64, price >= 0, straw enum. **No grade vs rows check** (D10).
- `hat_events.type`: `created, stage_advanced, flag_raised, flag_reviewed, edited, transferred, claimed, archived` (D2). `stage_advanced` must be exactly one step (`to_stage = from_stage + 1`).
- `agent_runs.status`: `running, proposed, failed, stopped, answered, refused` (D3).
- `proposals.status`: `pending, question, blocked, approved, rejected, dismissed, failed`.
- `weavers.province`: `Azuay, Cañar, Manabí, Other`; bio up to 200 chars.

Triggers:
- `hats_guard` (before insert or update on `hats`): on update, archived hats are frozen, `code`/`workshop_id`/`created_at` can't change, stage can only stay or move +1, `version` is always set to `old.version + 1`, `updated_at = now()`. On insert by an app user (`authenticated`), stage must be 0 (D15) and version, owner and transfer fields are reset. The service role and migrations may insert history at any stage, which is why the seed never disables the trigger.
- `hat_events_no_change`: raises on every update and delete. Single exception: `seed_backfill_actors()` may fill a NULL `actor_id` (nothing else in the row may change).
- `on_auth_user_created` (after insert on `auth.users`): creates the profile with role `member` (metadata can't pick a role). If `raw_user_meta_data.workshop_name` is set it also creates the workshop (city from `city`, contact email = user email); otherwise `workshop_id` stays null until the seed script sets it.

## RLS summary

| Table | Members | Admins | Anon |
|---|---|---|---|
| workshops | read/update own (name, city, contact_email, show_prices) | read all | none |
| profiles | read self + same workshop; update own `name` only | read all | none |
| weavers | read/insert/update own workshop | read all | none |
| hats | read own; insert own (Weaving only); update while workshop-owned and no transfer pending | read all | none |
| hat_events | read via hat; insert as yourself on own hats; never update/delete | read all | none |
| hat_flags | read via hat; review once (review columns only) | read all | none |
| agent_runs | none | read all | none |
| proposals | read own workshop | read all | none |
| app_logs | insert own `web` rows (`user_id = auth.uid()`) | read all | none (use `log_public`) |

Admins write only inside their own workshop (Toquilla Trace HQ), so they have no cross-workshop writes (D7). Anon has no table privileges at all; the passport is read only through `public_hat_passport`. Clients never write `proposals` or `agent_runs` (D4, D5).

## Functions

| Signature | Security | Who can call | Notes |
|---|---|---|---|
| `my_workshop_id() returns uuid` | definer, stable | authenticated | Used by policies |
| `is_admin() returns boolean` | definer, stable | authenticated | Used by policies |
| `grade_for_rows(r int) returns text` | immutable | anon, authenticated | Mirrors `GRADE_RANGES` |
| `generate_hat_code() returns text` | invoker | authenticated, service_role | D1 alphabet, crypto-random bytes |
| `public_hat_passport(p_code text) returns jsonb` | definer, stable | anon, authenticated | Spec 06 shape. `null` for malformed or unknown code. `viewer` = anonymous / owner / recipient / other. Never returns uuids, `transfer_email`, owner ids, notes, version, hidden price or hidden weaver name/bio |
| `log_passport_view(p_code text, p_via text = 'link', p_is_bot boolean = false, p_request_id text = null) returns void` | definer | anon, authenticated | Writes `passport.view` or `passport.verify_failed` (spec 06) |
| `log_public(action text, level text, payload jsonb = '{}') returns void` | definer | anon, authenticated | D6 allowlist: `auth.login_failed`, `auth.signup` (failures only), `passport.view`, `passport.verify_failed`, `ui.error`. Lifts `message`, `request_id`, `hat_code`, `error` from payload into columns; strips email/user id/IP/token keys; payload capped at 2 KB |
| `claim_hat(p_code text, p_request_id text = null) returns jsonb` | definer | authenticated | D11: confirmed email must match `transfer_email` (case-insensitive). One conditional update, `claimed` event, `hat.claim` log. Returns `{ ok, result, claimed_at }`, result in `claimed, already_owner, not_recipient, email_unconfirmed, not_authenticated` |
| `advance_hat(p_code text, p_expected_version int, p_note text = null) returns table(code text, stage smallint, version int)` | invoker (RLS) | authenticated | Next stage only. Errors: `not_found`, `archived`, `not_owner`, `finished`, `version_conflict` |
| `create_hat(p_weaver_id uuid, p_grade text, p_rows int, p_straw text = 'Natural', p_size int = null, p_price numeric = null, p_note text = null) returns table(id uuid, code text)` | invoker (RLS) | authenticated | Generates the code (5 tries on collision), stage Weaving. Errors: `no_workshop`, `weaver_not_found`, `grade_mismatch` |
| `transfer_hat(p_code text, p_expected_version int, p_to text, p_email text, p_message text = null) returns jsonb` | invoker (RLS) | authenticated | Spec 08. Errors: `invalid_target`, `invalid_email`, `version_conflict` |
| `archive_hat(p_code text, p_expected_version int, p_note text = null) returns jsonb` | invoker (RLS) | authenticated | Spec 08. Error: `version_conflict` |
| `mark_flag_reviewed(p_flag_id uuid, p_reason text = null) returns jsonb` | invoker (RLS) | authenticated | Reviews once and adds a `flag_reviewed` event. Error: `not_found_or_reviewed` |
| `restore_proposal(p_id uuid, p_status text = null) returns jsonb` | definer | authenticated | D4. Own workshop, only from `rejected`/`dismissed`. Without `p_status`: dismissed -> blocked, rejected -> question (if payload has `question`) or pending |
| `apply_proposal(p_proposal_id uuid, p_actor uuid, p_payload jsonb, p_edits jsonb = null, p_codes text[] = null) returns jsonb` | definer | **service_role only** | Spec 04. Idempotent on approved. `p_codes` null means codes are generated in SQL. Advance accepts `expected_version` or `hat_version` in the payload. Errors: `not_found`, `not_open`, `quantity_range`, `weaver_not_found`, `version_conflict`, `hat_unavailable` |
| `save_agent_run(p_run_id uuid, p_status text, p_summary text, p_steps jsonb, p_proposals jsonb, p_tokens_in int, p_tokens_out int, p_latency_ms int, p_cost_usd numeric, p_model text, p_error jsonb = null) returns jsonb` | definer | **service_role only** | Spec 03. Updates the run row (inserted earlier by the Edge Function) and inserts its proposals in one transaction. Returns `[{ id, temp_id, type, status }]` in input order |
| `seed_backfill_actors(p_workshop_id uuid, p_actor uuid) returns jsonb` | definer | **service_role only** | Used by `scripts/seed-users.mjs` |

Errors are raised as plain exceptions whose message is the code (SQLSTATE P0001, HTTP 400 through PostgREST; `not_found` uses P0002). All execute rights were revoked from `public`, `anon` and `authenticated` first, then granted as above.

## Demo data

- Workshops (fixed ids): Taller Pillco, Cuenca `11111111-1111-4111-8111-111111111111`; Toquilla Trace HQ `22222222-2222-4222-8222-222222222222`; Eval Workshop `33333333-3333-4333-8333-333333333333`.
- Taller Pillco weavers: Rosa Pillco, Rosa Guamán, Manuel Delgado, Carmen Quizhpi (handoff), plus Lucía Tenesaca (`show_name = false`).
- 22 Taller Pillco hats: the 5 handoff hats (TQ-7F3K2 Washing, TQ-9A1M8 Finished and transferred to `buyer@test.com` but not claimed, TQ-2C5P0 Weaving, TQ-4K9D1 Superfino at 18 rows in Blocking with a `grade_mismatch` flag, TQ-8B2N4 Washing) plus 17 more across all weavers, grades and stages (one archived, one `too_fast` flag, one reviewed flag). Manuel has 4 other open hats, so the passport shows "Other hats by Manuel: 4". Every hat has full `hat_events` history with Spanish notes; `version` matches the number of updates.
- Eval Workshop: the 4 handoff weavers and hats TQ-E7F3K, TQ-E9AHM, TQ-E2C5P, TQ-E4K9D (flagged), TQ-E8B2N (spec 10).
- 3 workshop agent runs (Oct 12, Oct 14, Oct 18) with spec 09 `steps`, model `gemini-2.5-flash-lite`, 8k to 9k input tokens, about $0.001 each, 3 to 4 s. 9 proposals: approved, rejected, an edited approval after a version conflict, and a blocked stage skip that was dismissed. 1 concierge run (answered).
- 43 `app_logs` rows between 2026-10-18 02:00 UTC and 2026-10-19 00:40 UTC: logins, failed login, failed sign-up, voice, a full agent run, approvals, a `version_conflict` error, flag review, weaver edit, manual advance, archive, create, passport views, concierge answers, a refusal, a concierge timeout error and a `ui.error`.

## Demo accounts

Created by `scripts/seed-users.mjs` from `.env` (`DEMO_ADMIN_EMAIL`, `DEMO_MEMBER_EMAIL`, `DEMO_BUYER_EMAIL`, `DEMO_PASSWORD`), all email-confirmed:

| Account | Email (current .env) | Role | Workshop |
|---|---|---|---|
| Admin | admin@test.com | admin | Toquilla Trace HQ |
| Member ("Xavier") | member@test.com | member | Taller Pillco |
| Buyer | buyer@test.com | member | none (can claim TQ-9A1M8) |

The shared password is never in git. It is in the submitter's `.env` and goes in the submission note (D12).

## How to (re)seed

```bash
npx --yes supabase@2.121.0 link --project-ref mflvsnpyckuwhicvgnsr -p "$(< .db-password)"
npx --yes supabase@2.121.0 db push -p "$(< .db-password)"
node --env-file=.env scripts/seed-users.mjs
```

The script is idempotent: it creates or updates the 3 users (password and `email_confirm` from env), upserts their profiles (role, workshop, name), points the TQ-9A1M8 transfer at `DEMO_BUYER_EMAIL` while it is unclaimed, and calls `seed_backfill_actors` for Taller Pillco (member) and HQ (admin). To reset the claim demo after someone claimed TQ-9A1M8, the hat must be reseeded by SQL (claims are one-way by design).

## Deviations from the specs (and why)

1. **Sign-up trigger only creates a workshop when metadata has `workshop_name`** (spec 01 always creates one, falling back to "My workshop"). Seeded accounts are created without a workshop and attached by the script. The app's sign-up form always sends `workshop_name`, so real sign-ups behave as in spec 01.
2. **`version` is bumped by the trigger** (spec 08 style), not checked against `old + 1` (spec 05). Writers that set `version = version + 1` and writers that don't both end at `old + 1`. Conflicts are detected by `where version = expected`.
3. **`version_conflict` uses the default SQLSTATE, not 40001.** PostgREST retries 40001 automatically, which turned a stale-version call into an HTTP 504 after the gateway timeout. Found by the verification run and fixed in migration 5. `hats_guard` raises `check_violation` (23514).
4. **No trigger disabling in the seed** (spec 05 suggested disabling `hats_guard` around TQ-4K9D1). With D10 there is no grade check, and the insert guard only restricts `authenticated`, so history inserts as `postgres` pass normally.
5. **Actor ids are backfilled.** Users don't exist when the seed migration runs, so `actor_id`, `user_id` and `decided_by` start NULL and `seed_backfill_actors()` fills them. That needs one narrow exception in the append-only trigger (NULL actor only, flag set inside a service-role function). Anonymous rows (passport, concierge, `log_public` actions) stay NULL.
6. **`create_hat` generates the code in SQL** and has no `p_code` parameter (spec 08 had the server action generate it). It also blocks a grade/rows mismatch, which D10 allows because it is a new write, not existing data.
7. **`claim_hat` returns `result`** for every outcome (spec 06 used `error` for not authenticated) and skips archived hats. `from_owner_type` and `workshop_id` are only logged on success, so a failed claim can't be used to learn about a hat.
8. **`restore_proposal(p_id, p_status default null)`**: D4 names one argument, spec 04 has two. The second is optional and inferred when missing.
9. **`save_agent_run` returns the created proposals** (spec 03 returned void), so the Edge Function gets real proposal ids without a second query.
10. **`apply_proposal` merges** `hat_codes`, `flag_id` and `applied_at` into the existing `rule_result` instead of replacing it, so the proposal-time rule result is kept for the trace. It also re-checks weaver workshop, quantity, ownership, transfer and archived state in SQL.
11. **`app_logs` insert policy also requires `source = 'web'`** (spec 09), on top of spec 01's `user_id` and workshop checks.
12. **Anon has no table privileges** (spec 01 expected anon selects to return 0 rows; they now return 401 permission denied). Less surface, same result for the app.
13. **Hats update policy has no seller/buyer clause** (spec 05 mentioned one). Buyers and sellers have no write feature besides `claim_hat`, which is security definer.
14. **TQ-9A1M8 dates**: weaving from 2026-05-12, Washing Sep 10, Bleaching Sep 18, Blocking Sep 26, Finished Oct 2, transferred Oct 10 (spec 08 dates; spec 06 had slightly different ones). About 4 months of weaving. Owner type is `buyer` with `owner_user_id` null and `transfer_email` set, which the passport shows as a pending transfer (D22).
15. **TQ-8B2N4 moved to Washing on 2026-10-18** (spec 08 says Oct 16), so the seeded agent run, its version conflict and its logs fall inside "the last day".
16. **Extra functions not in the task list**: `log_passport_view` (spec 06), `transfer_hat` and `archive_hat` (spec 08), `generate_hat_code`, `seed_backfill_actors`. `hat_events.run_id` has a foreign key to `agent_runs`.
17. **Email confirmation (D11)** is a Supabase Auth dashboard setting, not SQL. `claim_hat` checks `email_confirmed_at` either way; demo users are created confirmed.
18. **No eval user** is created: `.env` has no `EVAL_EMAIL`. Create one in the dashboard and set its `profiles.workshop_id` to the Eval Workshop id above.

## Known limits

- `log_public` is callable by anyone, so it can be spammed. Rate limiting is a next step (per IP at the edge, or a count check in the function).
- No retention job for `app_logs` yet (manual cleanup SQL in spec 09).
