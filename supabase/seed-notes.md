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
| `20261019000006_definer_hat_writes.sql` | Security: members lose direct insert on `hats`/`hat_events` and update of stage, archive and transfer columns; the five write RPCs become security definer with explicit workshop checks |
| `20261019000007_log_public_v2.sql` | `log_public` accepts pending sign-ups and `concierge.feedback`, strips identifying keys at every depth |
| `20261019000008_eval_flag_reviewed.sql` | Eval Workshop only: reviews the seeded flag on TQ-E4K9D |
| `20261019001001_hat_grants_contact_email.sql` | Security S1: members lose all direct UPDATE on `hats` (dead insert/update policies dropped). S2: sign-up no longer copies the login email into `workshops.contact_email`; existing self-signed-up workshops whose contact was the owner's login email are cleared |
| `20261019001002_log_flood_guard.sql` | Security S4 (partial): `log_flood_guard()` caps anonymous logs at 300 rows per action per minute; `log_public` rejects raw payloads over 8 KB |
| `20261019001003_eval_reset.sql` | `reset_eval_workshop()` (service role) plus narrow Eval Workshop exceptions in `hats_guard` and the `hat_events` append-only trigger; seeds the "HQ Test Weaver" used by `npm run verify:security` |

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
  Exception (migration `20261019001003`): while `reset_eval_workshop()` runs (transaction-local flag `toquilla.eval_reset`), updates of Eval Workshop hats pass unchanged, so seeded stage and version can be restored.
- `hat_events_no_change`: raises on every update and delete. Two exceptions: `seed_backfill_actors()` may fill a NULL `actor_id` (nothing else in the row may change), and `reset_eval_workshop()` may delete events of Eval Workshop hats. Both use a transaction-local flag that only those service-role functions set; PostgREST gives clients no way to call `set_config`.
- `on_auth_user_created` (after insert on `auth.users`): creates the profile with role `member` (metadata can't pick a role). If `raw_user_meta_data.workshop_name` is set it also creates the workshop (city from `city`, **contact email null** since migration `20261019001001`: the login email is private and the passport hides the contact link when it is null); otherwise `workshop_id` stays null until the seed script sets it.

## RLS summary

| Table | Members | Admins | Anon |
|---|---|---|---|
| workshops | read/update own (name, city, contact_email, show_prices) | read all | none |
| profiles | read self + same workshop; update own `name` only | read all | none |
| weavers | read/insert/update own workshop | read all | none |
| hats | read own; no direct insert or update at all (every write goes through the definer RPCs) | read all | none |
| hat_events | read via hat; no direct insert (RPCs only); never update/delete | read all | none |
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
| `log_passport_view(p_code text, p_via text = 'link', p_is_bot boolean = false, p_request_id text = null) returns void` | definer | anon, authenticated | Writes `passport.view` or `passport.verify_failed` (spec 06). Flood guard since migration `20261019001002` |
| `log_public(action text, level text, payload jsonb = '{}') returns void` | definer | anon, authenticated | D6 allowlist: `auth.login_failed`, `auth.signup` (failures and pending sign-ups, migration 7), `passport.view`, `passport.verify_failed`, `ui.error`, `concierge.feedback`. Rejects a raw payload over 8 KB (`payload_too_large`). Lifts `message`, `request_id`, `hat_code`, `error` from payload into columns; strips email/user id/IP/token keys at every depth; stored payload capped at 2 KB |
| `log_flood_guard(p_action text) returns void` | invoker | nobody (called by the two definer log functions) | Raises `log_rate_limited` when more than 300 rows with that action were written in the last minute (counts at most 301 rows) |
| `claim_hat(p_code text, p_request_id text = null) returns jsonb` | definer | authenticated | D11: confirmed email must match `transfer_email` (case-insensitive). One conditional update, `claimed` event, `hat.claim` log. Returns `{ ok, result, claimed_at }`, result in `claimed, already_owner, not_recipient, email_unconfirmed, not_authenticated` |
| `advance_hat(p_code text, p_expected_version int, p_note text = null) returns table(code text, stage smallint, version int)` | definer (migration 6, explicit workshop checks) | authenticated | Next stage only. Errors: `not_found`, `archived`, `not_owner`, `finished`, `version_conflict` |
| `create_hat(p_weaver_id uuid, p_grade text, p_rows int, p_straw text = 'Natural', p_size int = null, p_price numeric = null, p_note text = null) returns table(id uuid, code text)` | definer (migration 6, explicit workshop checks) | authenticated | Generates the code (5 tries on collision), stage Weaving. Errors: `no_workshop`, `weaver_not_found`, `grade_mismatch` |
| `transfer_hat(p_code text, p_expected_version int, p_to text, p_email text, p_message text = null) returns jsonb` | definer (migration 6, explicit workshop checks) | authenticated | Spec 08. Errors: `invalid_target`, `invalid_email`, `version_conflict` |
| `archive_hat(p_code text, p_expected_version int, p_note text = null) returns jsonb` | definer (migration 6, explicit workshop checks) | authenticated | Spec 08. Error: `version_conflict` |
| `mark_flag_reviewed(p_flag_id uuid, p_reason text = null) returns jsonb` | definer (migration 6, explicit workshop checks) | authenticated | Reviews once and adds a `flag_reviewed` event. Error: `not_found_or_reviewed` |
| `restore_proposal(p_id uuid, p_status text = null) returns jsonb` | definer | authenticated | D4. Own workshop, only from `rejected`/`dismissed`. Without `p_status`: dismissed -> blocked, rejected -> question (if payload has `question`) or pending |
| `apply_proposal(p_proposal_id uuid, p_actor uuid, p_payload jsonb, p_edits jsonb = null, p_codes text[] = null) returns jsonb` | definer | **service_role only** | Spec 04. Idempotent on approved. `p_codes` null means codes are generated in SQL. Advance accepts `expected_version` or `hat_version` in the payload. Errors: `not_found`, `not_open`, `quantity_range`, `weaver_not_found`, `version_conflict`, `hat_unavailable` |
| `save_agent_run(p_run_id uuid, p_status text, p_summary text, p_steps jsonb, p_proposals jsonb, p_tokens_in int, p_tokens_out int, p_latency_ms int, p_cost_usd numeric, p_model text, p_error jsonb = null) returns jsonb` | definer | **service_role only** | Spec 03. Updates the run row (inserted earlier by the Edge Function) and inserts its proposals in one transaction. Returns `[{ id, temp_id, type, status }]` in input order |
| `seed_backfill_actors(p_workshop_id uuid, p_actor uuid) returns jsonb` | definer | **service_role only** | Used by `scripts/seed-users.mjs` |
| `reset_eval_workshop() returns jsonb` | definer | **service_role only** | `npm run eval:reset`. Eval Workshop only: deletes its proposals, agent runs, extra hats and non-seed events/flags, keeps the seeded flag on TQ-E4K9D reviewed, restores the 5 eval hats to their seeded stage, version and details. Returns counts |

Errors are raised as plain exceptions whose message is the code (SQLSTATE P0001, HTTP 400 through PostgREST; `not_found` uses P0002). All execute rights were revoked from `public`, `anon` and `authenticated` first, then granted as above.

## Demo data

- Workshops (fixed ids): Taller Pillco, Cuenca `11111111-1111-4111-8111-111111111111`; Toquilla Trace HQ `22222222-2222-4222-8222-222222222222`; Eval Workshop `33333333-3333-4333-8333-333333333333`.
- Taller Pillco weavers: Rosa Pillco, Rosa Guamán, Manuel Delgado, Carmen Quizhpi (handoff), plus Lucía Tenesaca (`show_name = false`).
- 22 Taller Pillco hats: the 5 handoff hats (TQ-7F3K2 Washing, TQ-9A1M8 Finished and transferred to `buyer@test.com` but not claimed, TQ-2C5P0 Weaving, TQ-4K9D1 Superfino at 18 rows in Blocking with a `grade_mismatch` flag, TQ-8B2N4 Washing) plus 17 more across all weavers, grades and stages (one archived, one `too_fast` flag, one reviewed flag). Manuel has 4 other open hats, so the passport shows "Other hats by Manuel: 4". Every hat has full `hat_events` history with Spanish notes; `version` matches the number of updates.
- Eval Workshop: the 4 handoff weavers and hats TQ-E7F3K, TQ-E9AHM, TQ-E2C5P, TQ-E4K9D (flagged), TQ-E8B2N (spec 10). `npm run eval:reset` puts it back to exactly this state.
- Toquilla Trace HQ: one weaver, "HQ Test Weaver" (`bbbbbbbb-0000-4000-8000-000000000021`, migration `20261019001003`). `npm run verify:security` creates one throwaway hat with it per run, transfers it to the demo buyer, claims it and archives it (with the service role, since a claimed hat can't be archived by the workshop). Archived HQ hats with the note "verify-security throwaway" are expected.
- 3 workshop agent runs (Oct 12, Oct 14, Oct 18) with spec 09 `steps`, model `gemini-2.5-flash-lite`, 8k to 9k input tokens, about $0.001 each, 3 to 4 s. 9 proposals: approved, rejected, an edited approval after a version conflict, and a blocked stage skip that was dismissed. 1 concierge run (answered).
- 43 `app_logs` rows between 2026-10-18 02:00 UTC and 2026-10-19 00:40 UTC: logins, failed login, failed sign-up, voice, a full agent run, approvals, a `version_conflict` error, flag review, weaver edit, manual advance, archive, create, passport views, concierge answers, a refusal, a concierge timeout error and a `ui.error`.

## Demo accounts

Created by `scripts/seed-users.mjs` from `.env` (`DEMO_ADMIN_EMAIL`, `DEMO_MEMBER_EMAIL`, `DEMO_BUYER_EMAIL`, `DEMO_PASSWORD`), all email-confirmed:

| Account | Email (current .env) | Role | Workshop |
|---|---|---|---|
| Admin | admin@test.com | admin | Toquilla Trace HQ |
| Member ("Xavier") | member@test.com | member | Taller Pillco |
| Buyer | buyer@test.com | member | none (can claim TQ-9A1M8) |
| Eval runner | eval@test.com (`EVAL_EMAIL`) | member | Eval Workshop |

The shared password is never in git. It is in the submitter's `.env` and goes in the submission note (D12). `/login` and `/signup` show a "Reviewing this project?" note with these emails (not the password).

## Demo credentials (demo only)

- **One shared, short password for all demo accounts, including admin@test.com, on purpose.** Several reviewers need to sign in quickly with accounts they can type, and the note on `/login` says so plainly ("shared demo accounts with a demo-only password").
- **Never used for real data.** The demo workshops hold seeded sample hats only. Anyone with the submission note can sign in as admin and read every workshop's demo data, logs and agent runs; that is accepted for a demo.
- The password is 7 characters, which is why the Supabase server minimum stays at 6 (`supabase/config.toml`). The app's own forms require 8 for every new account and for a reset (`PASSWORD_MIN` in `components/auth/rules.ts`), and real sign-ups need email confirmation.
- **A real deployment would differ:** a unique, long, random admin password kept in a password manager; MFA on admin accounts; no shared accounts (one login per person, so actions are attributable); the admin role granted out of band (SQL or the dashboard by an operator, never through sign-up); server minimum raised to match the app; demo accounts and the `@test.com` addresses removed (test.com is a real third-party domain, so no mail should ever be sent there).

## How to (re)seed

```bash
npx --yes supabase@2.121.0 link --project-ref mflvsnpyckuwhicvgnsr -p "$(< .db-password)"
npx --yes supabase@2.121.0 db push -p "$(< .db-password)"
npm run seed:users          # node --env-file=.env scripts/seed-users.mjs
npm run eval:reset          # Eval Workshop back to its seeded state (run before npm run eval)
npm run verify:security     # live RLS / grants / RPC / claim-flow checks, exits 1 on any failure
```

The seed script is idempotent: it creates or updates the 4 users (3 demo + eval) (password and `email_confirm` from env), upserts their profiles (role, workshop, name), points the TQ-9A1M8 transfer at `DEMO_BUYER_EMAIL` while it is unclaimed, and calls `seed_backfill_actors` for Taller Pillco (member) and HQ (admin). To reset the claim demo after someone claimed TQ-9A1M8, the hat must be reseeded by SQL (claims are one-way by design).

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
13. **No hats update policy at all** since migration `20261019001001` (spec 05 described one with a seller/buyer clause). No client writes hats directly; buyers and sellers have no write feature besides `claim_hat`, which is security definer. An "Edit details" form, if added, should be a definer RPC that checks the weaver's workshop, re-runs `grade_for_rows` and writes an `edited` event.
14. **TQ-9A1M8 dates**: weaving from 2026-05-12, Washing Sep 10, Bleaching Sep 18, Blocking Sep 26, Finished Oct 2, transferred Oct 10 (spec 08 dates; spec 06 had slightly different ones). About 4 months of weaving. Owner type is `buyer` with `owner_user_id` null and `transfer_email` set, which the passport shows as a pending transfer (D22).
15. **TQ-8B2N4 moved to Washing on 2026-10-18** (spec 08 says Oct 16), so the seeded agent run, its version conflict and its logs fall inside "the last day".
16. **Extra functions not in the task list**: `log_passport_view` (spec 06), `transfer_hat` and `archive_hat` (spec 08), `generate_hat_code`, `seed_backfill_actors`. `hat_events.run_id` has a foreign key to `agent_runs`.
17. **Email confirmation (D11)** is a Supabase Auth dashboard setting, not SQL. `claim_hat` checks `email_confirmed_at` either way; demo users are created confirmed.
18. **Eval user** (`EVAL_EMAIL`, default `eval@test.com`; password `EVAL_PASSWORD` or `DEMO_PASSWORD`) is created confirmed by `scripts/seed-users.mjs` in the Eval Workshop. Migration 8 reviews the Eval Workshop's seeded `grade_mismatch` flag on TQ-E4K9D so the canonical eval can raise it again.
19. **Auth email links land on `/auth/confirm`** (`app/auth/confirm/route.ts`). `signUp` and `resetPasswordForEmail` pass `emailRedirectTo` / `redirectTo` = `<request origin>/auth/confirm?next=...` (`authCallbackUrl` in `components/auth/rules.ts`; falls back to the live site). The default Supabase email templates are kept, so the link uses the PKCE `?code=` flow, exchanged with `exchangeCodeForSession`; it must be opened in the browser that asked for it. The route also accepts `?token_hash=&type=` (`verifyOtp`) in case the templates are switched to token links later. Reset then goes to `/reset`, which calls `updateUser({ password })` with the sign-up rule (8+ characters, typed twice). A failed or cross-browser link goes to `/login?notice=link_invalid` (fixed copy; the email is already confirmed by Supabase at that point). No `config.toml` change was needed: `additional_redirect_urls` already allows `https://toquilla-trace.vercel.app/**` and localhost, query strings included (checked with `admin/generate_link`).

## Known limits

- `log_public` and `log_passport_view` are callable by anyone. Since migration `20261019001002` a global guard rejects a call when more than 300 rows with the same action were written in the last minute, and raw payloads over 8 KB are rejected (checked live: 330 calls in 2.5 s, 302 stored, 28 refused with `log_rate_limited`; test rows deleted). Residual risk: the cap is global, not per visitor (the database never sees the IP), so one client can still write about 300 rows per action per minute and, while it does, crowd out real anonymous logs of that action. Fake `passport.view` counts are still possible within the cap. The full fix is an Edge Function with a per-IP limit in front of anonymous logging.
- No retention job for `app_logs` yet (manual cleanup SQL in spec 09).
