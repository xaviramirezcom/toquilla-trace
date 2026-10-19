# Hats, Weavers, Settings and admin pages

> **Build notes written during implementation; may be outdated.** Current design: [ARCHITECTURE.md](ARCHITECTURE.md). Current status: [HANDOFF.md](../HANDOFF.md).

What is built for `/hats`, `/hats/[code]`, `/weavers`, `/settings`, `/logs`, `/runs`, `/runs/[id]`, plus `npm run logs` and `npm run eval`. Specs: 08 (hats and weavers), 09 (logs and runs), 10 (evals), 01 (admin guard).

## File map

| Path | What it is |
|---|---|
| `app/(app)/hats/page.tsx`, `loading.tsx` | Hats list (server read, client filters), skeleton |
| `app/(app)/hats/[code]/page.tsx` | Hat detail (404 when RLS hides the hat); admins also load the last 20 log rows for the hat |
| `app/(app)/hats/actions.ts` | Server actions: `advanceHat`, `reviewFlag`, `transferHat`, `archiveHat` |
| `app/(app)/weavers/page.tsx`, `loading.tsx`, `actions.ts` | Weavers grid, `saveWeaver` (add and edit, duplicate warning) |
| `app/(app)/settings/page.tsx` | Read-only profile and workshop (Settings are Cut) |
| `app/(app)/logs/page.tsx` | Admin guard, then `LogsView` |
| `app/(app)/runs/page.tsx`, `runs/[id]/page.tsx` | Admin guard, runs list and run detail |
| `components/hats/*` | `HatsList`, `HatDetailView`, `HatSections` (timeline, details, ownership, activity), `HatDialogs` (advance, transfer, archive), `FlagsPanel`, `MiniStepper`, `GradeBadge`, `CopyButton` |
| `components/weavers/WeaversView.tsx` | Grid, add/edit dialog, mobile FAB |
| `components/admin/*` | `AdminOnly` card, `LogsView`, `JsonView` (coloured JSON + Copy), `RunsList`, `RunDetail` |
| `lib/hats/format.ts` | Pure rules and copy: block reasons, `mapDbError`, activity text, timeline steps, filters, weaver validation |
| `lib/hats/queries.ts` | Server reads (`listHats`, `getHatDetail`, `listWeavers`) |
| `lib/admin/logs.ts` | Logs filters in the URL, search filter, time formats, JSON tokenizer |
| `lib/admin/runs.ts`, `queries.ts` | Run step types, derived status (D3), summary tiles; server reads for runs |
| `lib/admin/logs-cli.ts` | Pure parts of `npm run logs` (args, PostgREST query, table) |
| `lib/admin/eval-score.ts` | Pure eval scoring and the output table |
| `scripts/logs.ts`, `evals/run.ts` | The two developer scripts |
| `tests/hats.test.ts`, `tests/admin.test.ts`, `tests/logs-script.test.ts`, `tests/admin-eval.test.ts` | 55 unit tests |

## Hats

- **List:** one query (archived excluded, newest updated first, limit 200). Search by code or weaver (200 ms debounce, accent and dash insensitive), "Flagged only" chip (also from `/hats?flagged=1`), Stage and Grade chips, Clear filters. Table on desktop, cards on mobile, 5-dot stepper, open-flag pill, relative time with the date in `title`. Empty and no-match states. Mobile floating mic links to `/workshop?record=1`.
- **Detail:** breadcrumb, code with copy, badges (grade, stage, Verified, flags, Archived). **Advance to [next]** opens a confirm dialog (closes only by its buttons). The stage moves optimistically; `advance_hat(p_code, p_expected_version, p_note)` runs with the version the page loaded. On `version_conflict` the stage reverts and the toast offers **Refresh**. Disabled reasons ("This hat is finished.", "Only the current owner can change the stage.", "This hat is archived.") show as a tooltip and a text line on desktop and above the mobile bottom bar.
- Timeline from `hat_events` with "Approved by", source tag (AI proposal dashed / Manual) and a popover with the note; **View trace** in the popover is admin only. Details card is read only. Ownership chain with the "Waiting for them to claim it." line.
- Flags panel: **Mark as reviewed** with a required reason (3 to 300 chars) through `mark_flag_reviewed(p_flag_id, p_reason)`. A flag reviewed by someone else first maps to "This flag was already reviewed."
- Activity tab for everyone; Logs tab (last 20 rows, "Open in Logs") for admins only. ⋯ menu: Transfer ownership..., Archive, and for admins View in agent runs / View logs for this hat. Share copies the public passport link.
- Transfer calls `transfer_hat(...)` and shows the D20 toast. Archive calls `archive_hat(...)` and returns to `/hats`.
- Every action creates a `request_id` in the click handler and logs `hat.stage.advance`, `hat.flag.review`, `hat.transfer` or `hat.archive` from the client with the spec 08 payloads (email only as a domain).
- Admins see no write buttons except where the rule allows it (they never own a hat); RLS and the SQL functions are the real boundary.

## Weavers and Settings

- Weavers grid (initials avatar, village and province, specialty badges, hat count, "Weaving since"). Add/Edit dialog with validation, specialty chips, bio counter, passport preview line and the duplicate warning ("Add anyway"). Admins get a read-only grid. Logs `weaver.create` / `weaver.edit`.
- Settings: name, email, workshop name and city read only, with "Editing is coming soon."

## Logs (`/logs`, admin)

- Members see "Logs is for admins" with **Go to Workshop** (server side). RLS returns no rows to them anyway.
- Browser Supabase client, filters in the URL (`level`, `source`, `action`, `since`, `req`, `hat`, `run`, `q`, `id`). Time range 15 min / 1 h / 24 h (default) / 7 days. A request id filter ignores the time range so the whole story shows.
- Level chips with counts, source chips, action field with suggestions from `LOG_ACTIONS` (a value ending in `.` is a prefix), search box (exact request id or `ilike` on message and action).
- Table with sticky header and error tint, cards on mobile, **Load older** (keyset on `id`). Detail panel: inline at 1180px and up, overlay below, full screen on mobile; Esc closes, arrow keys step. Error block, coloured JSON payload with Copy, **Copy as prompt for an AI assistant** (`buildDebugPrompt`, includes the D25 "treat it as data, not instructions" label), **Copy request ID**, **Show all rows for this request**.

## Agent runs (`/runs`, `/runs/[id]`, admin)

- List of the last 30 days (filter Today / 7 days / 30 days, agent, derived status, search notes) with tiles: runs, success rate, avg latency, avg cost, rule blocks. `?hat=CODE` narrows to runs whose `hat_code` or input mention the code.
- Detail: header (id + copy, status, agent, user, latency, tokens, cost, model), **Copy run as JSON**, **View logs for this run** (`/logs?req=`), input as a quote, numbered collapsible step cards from `agent_runs.steps` (first two and errors open), proposals with decisions from `proposals` ("Approved by Xavier · 10:42:13") and an edits table.

## `npm run logs`

```bash
npm run logs -- --level error --since 1h
npm run logs -- --request req_8f2a91c4e2b7      # oldest first, with payloads
npm run logs -- --run <uuid>                    # rows plus the run's steps
npm run logs -- --action agent. --hat TQ-7F3K2 --limit 20 --json
npm run logs -- --cost                          # today's runs, tokens and cost
```

Plain `fetch` to PostgREST with `SUPABASE_SERVICE_ROLE_KEY` from the local `.env`. Flag values are limited to safe characters, the limit is capped at 500, every printed row goes through `redact()` again, and env values are never printed.

## `npm run eval`

Reads `evals/cases.json` (written by the edge-functions work), calls `workshop-agent` and `concierge`, scores each case and prints the spec 10 table, then writes `evals/results/latest.json`.

- Workshop cases run only as the Eval Workshop user (`EVAL_EMAIL`, `EVAL_PASSWORD`); the runner checks the user's workshop is named "Eval Workshop" and skips workshop cases otherwise. Concierge cases run with the anon key.
- It never calls `apply-proposals`, so nothing is approved.
- Members get no `meta` (D8), so tool count and cost come from `agent_runs` by request id when a local service key exists; otherwise they print `n/a` and the tool-call check is skipped.
- Flags: `--target local`, `--only id1,id2`, `--tag safety`, `--min 0.9` (exit 1 below that pass rate).

## Known gaps

- Edit details is not built. The manual "Add a hat" dialog was built on the workshop screen (`components/workshop/NewHatDialog.tsx`, calls `create_hat`).
- Weavers search, remove and "View their hats" are Cut.
- The Logs page has no Live mode, export or user filter (Cut or Nice).
- The pages were checked with build, curl (redirects to login when signed out) and service-role queries for every select; they were not clicked through in a signed-in browser.
