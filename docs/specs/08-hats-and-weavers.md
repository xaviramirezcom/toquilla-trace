# 08. Hats and weavers

## 1. Summary

The workshop's records: a Hats list, a Hat detail page where a person can advance a stage (confirm dialog, optimistic update, version check), the hat's timeline and flags, plus a minimal Weavers page and a manual "Add a hat" dialog. It also owns hat code generation and the seed data every other feature demos with.

Serves: **real application logic** (stage rules in code and in the database, optimistic locking), **several real interactions** (advance, review flag, create hat, add weaver), **prioritization** (strict cut line below), **product taste** (handoff copy, mobile cards).

## 2. Scope

| Item | Must/Nice/Cut | Why |
|---|---|---|
| Seed data (workshop, 4 weavers, 5 hats, events, 1 flag) | Must | Every demo and the passport depend on it |
| Hat code generation (`generateCode`, retry on collision) | Must | Used by manual create and `apply-proposals` |
| Hats list: one query, sorted by last updated, table on desktop, cards on mobile | Must | Approved AI changes must be visible somewhere |
| Hat detail: header, badges, production timeline, details (read only), ownership chain, Activity list | Must | Shows provenance and who approved what |
| Advance stage: dialog + `advance_hat` RPC with version check + DB stage guard | Must | Strongest "rules in code" interaction outside the agent |
| Admin-only menu items (View in agent runs, View logs for this hat) | Must | 2 links, shows the role difference |
| Flags panel with **Mark as reviewed** (required reason) | Nice | Human in the loop for anomalies, 6 min |
| Manual create hat dialog | Nice | Backup path when the agent is down |
| Weavers grid + Add/Edit dialog | Nice | Conventions list Weavers page as Nice. Seed covers the demo |
| Search box on Hats list (client side, code or weaver) | Nice | 3 min |
| "Flagged only" chip (`/hats?flagged=1`) | Nice | Today tile "Flags to check" links here |
| Transfer ownership (sets `owner_type` + `transfer_email`, no email sent) | Nice | Needed for the passport claim demo, seed already has a transferred hat |
| Archive with destructive confirm | Nice | 4 min |
| Share button = copy public link | Nice | 1 min |
| Multi-select filters (Stage, Grade, Weaver, Owner), sort menu, view toggle | Cut | Conventions: filters are Nice at best; 5 hats need no filters |
| Bulk bar, Export CSV, pagination / Load more | Cut | No value at seed size |
| Edit details form, "Fix grade", unsaved-changes guard | Cut | Agent and flags cover corrections |
| Share dialog with QR, "Show price" toggle | Cut | Conventions cut QR images |
| Logs tab on Hat detail, timeline popover with View trace | Cut | Admin links to `/logs?hat=` and `/runs?hat=` cover it |
| Remove weaver, weaver search, "View their hats" | Cut | No delete policy, small lists |
| Mobile floating mic on Hats / Hat detail | Cut | Owned by the workshop composer spec |

## 3. User stories

**Member**
- I see all my workshop's hats, newest updated first, and tap one to open it.
- On a hat, I see its stage, timeline (who approved each step, AI or manual), weaver and owner.
- I can move a hat to the next stage after confirming, and I'm told clearly if someone else changed it first.
- I can mark a flag as reviewed with a reason. (Nice)
- I can add a hat by hand and get a new `TQ-XXXXX` code. (Nice)
- I can add and edit weavers. (Nice)
- I can transfer a hat to a seller or buyer by email; after that I can't change it. (Nice)

**Admin**
- Same views across all workshops (read only via RLS), plus ⋯ items **View in agent runs** and **View logs for this hat**.

## 4. UI

### 4.1 Hats list (`/hats`), handoff "Hats list"

- Header: "Hats" + count ("5 hats"; when search or flagged filter is active "n of 5 hats"). Button **+ New hat** (opens manual create, Nice; hidden if not built).
- Toolbar (Nice): search "Search by code or weaver" with clear ×, 200ms debounce, filters in memory. "Flagged only" chip.
- **Desktop (≥ 768px) table** columns: Code (mono + copy icon, toast "Code copied."), Grade badge, Rows/in, Weaver + village, Stage (5-dot mini stepper + label), Owner, Flags (warn pill with open count), Updated (relative, absolute in `title`). Whole row links to `/hats/[code]`.
- **Mobile cards:** code, grade, weaver · village · rows, stepper, flag text inline ("Grade says Superfino but 18 rows/inch"), owner and updated.
- Archived hats are excluded.
- States:

| State | UI |
|---|---|
| Loading | 5 skeleton rows / cards (`loading.tsx`) |
| Empty (no hats) | "No hats yet." + **Add your first hat** (opens manual create, or links to `/workshop` if create is not built) |
| No match | "No hats match these filters." + **Clear filters** |
| Error | Route `error.tsx`: page error copy from handoff ("Something went wrong", "We couldn't load this page. The error was saved to the log.") |

### 4.2 Hat detail (`/hats/[code]`), handoff "Hat detail"

- Breadcrumb "Hats / TQ-7F3K2". Code 36px mono (28 mobile) + copy (toast "Code copied.").
- Badges: grade, stage, Verified (always, since the record exists), flag count (warn) if open flags, Archived (muted).
- **Desktop actions:** **Advance to [next stage]** (primary), **Share** (Nice: copies `/hat/CODE`, toast "Link copied."), ⋯ menu: Transfer ownership... (Nice), Archive (Nice); admins also see **View in agent runs** (`/runs?hat=CODE`) and **View logs for this hat** (`/logs?hat=CODE`).
- **Mobile:** bottom bar with Share and **Advance to …** (fills width, 48px). Disabled reason shown as text above the bar.
- **Advance button disabled reasons** (tooltip on desktop, text on mobile):
  - finished: "This hat is finished."
  - not owner (transferred): "Only the current owner can change the stage."
  - archived: "This hat is archived." (new copy, see Open questions)
- **Advance dialog:** title "Move TQ-7F3K2 to Bleaching?", mini stepper `Washing ● → ○ Bleaching`, text "This can't be undone. Stages only move forward.", field "Add a note (optional)" (max 500), buttons **Cancel** / **Move to Bleaching** (loading "Moving..."). Destructive-style confirm: closes only via buttons. Success toast: "TQ-7F3K2 moved to Bleaching."
- **Conflict** (version mismatch): dialog closes, stage reverts, error toast "Couldn't save this change. Someone may have updated this hat." with action **Refresh** (calls `router.refresh()`).
- **Flags panel** (Nice, warn card, only when flags exist): each flag shows message and "Raised by Assistant" (sparkle icon) or "Raised by System". **Mark as reviewed** reveals an inline required "Reason" input + **Save** / **Cancel**. After save the flag is muted: "Reviewed by Xavier: 'Recounted, it's 28.'" Toast "Flag marked as reviewed."
- **Production timeline:** horizontal 5 columns desktop, vertical mobile.
  - Done: 30px `--ok` check circle, date, "Approved by {name}", source tag "AI proposal" (dashed accent) or "Manual".
  - Current: 3px accent ring, "In progress since Oct 14 (4 days)".
  - Upcoming: hollow, muted.
- **Details card (read only):** Grade, Rows per inch, Straw color, Size ("58 cm" or "Not set"), Price ("$120" or "Not set"), Weaver (link to `/weavers`), Workshop, Created.
- **Ownership chain:** chips Workshop → Seller → Buyer. Current owner accent with pin icon; past owners solid with date; future dashed. When `transfer_email` is set and not claimed, text line "Transferred to a buyer on Oct 10, 2026. Waiting for them to claim it."
- **Activity tab** (everyone): `hat_events` newest first: icon, text (see 6.6), actor name · relative time.
- **Transfer dialog** (Nice): "Transfer TQ-7F3K2", radio cards **To a seller** / **To a buyer**, email (validated, error "Enter a valid email."), optional message, warning "You won't be able to change this hat after transferring it.", destructive **Transfer** ("Transferring..."). Toast "Transfer recorded. They can claim it from the hat's passport." (D20)
- **Archive confirm** (Nice): "Archive TQ-2C5P0? It will be hidden from lists but its passport stays valid." **Cancel** / **Archive** (err). Toast "TQ-2C5P0 archived." then redirect to `/hats`.
- Not found or other workshop's hat (RLS hides it): Next.js `notFound()` (404 page from spec 01 / handoff).

### 4.3 Manual create dialog (Nice), handoff "Manual create dialog"

- Title "Add a hat manually", note "Prefer typing a note? The assistant can do this for you."
- Fields: Weaver (select, required; if no weavers, text "Add a weaver first" linking to `/weavers`), Grade (segmented Standard / Fino / Superfino), Rows per inch (required, 6 to 40), Straw color (Natural / Bleached / Dyed, default Natural), Size cm (52 to 64, optional), Price USD (optional, 0 to 10000), Notes (optional, max 500).
- Live validation; mismatch warning "18 rows/inch usually means Fino." with **Use Fino** fix. **Create hat** stays disabled while the grade does not match (rule in code, see rule 9).
- **Create hat** ("Creating..."). Success: dialog closes, toast "TQ-8B2N4 created." with **View** action.

### 4.4 Weavers (`/weavers`, Nice), handoff "Weavers"

- Header "Weavers" + count, **+ Add weaver** (FAB 56px on mobile).
- Grid of 280px cards: 48px initials avatar (Newsreader on `--straw`), name, "Village, Province", specialty grade badges, "n hats", "Weaving since 1998" (hidden if null). ⋯ menu: **Edit** only.
- Empty: "No weavers yet. Add the artisans you work with so the assistant can recognize them in your notes."
- **Add/Edit dialog:** Full name* and Village* (required), Province (Azuay / Cañar / Manabí / Other), Specialty (toggle chips Standard / Fino / Superfino), Weaving since (optional), Bio (200 chars with counter), checkbox "Show this weaver's name on public passports" (default on) with preview line: on "Hand-woven by Rosa Pillco in Sígsig", off "A master weaver from Sígsig".
- Duplicate warning (same name and village, case-insensitive, in this workshop): "A weaver named Rosa Pillco from Sígsig already exists. Add anyway?" Primary changes to **Add anyway**.
- Save: "Saving...", toast "{name} saved."

## 5. Data

Tables: `hats`, `hat_events`, `hat_flags`, `weavers`, `workshops`, `profiles` (actor names). RLS is defined in spec 01. New SQL below goes in `0001_init.sql` after the tables.

### 5.1 Constraints and the `hat_events.type` vocabulary

```sql
alter table hats add constraint hats_grade_chk check (grade in ('Standard','Fino','Superfino'));
alter table hats add constraint hats_rows_chk  check (rows_per_inch between 6 and 40);
alter table hats add constraint hats_stage_chk check (stage between 0 and 4);
alter table hats add constraint hats_straw_chk check (straw in ('Natural','Bleached','Dyed'));
alter table hats add constraint hats_size_chk  check (size_cm is null or size_cm between 52 and 64);
alter table hats add constraint hats_code_chk  check (code ~ '^TQ-[A-Z0-9]{5}$');
alter table hats add constraint hats_owner_chk check (owner_type in ('workshop','seller','buyer'));
alter table hat_events add constraint ev_type_chk check (type in
  ('created','stage_advanced','transferred','claimed','archived','flag_reviewed','edited'));
alter table weavers add constraint wv_province_chk check (province in ('Azuay','Cañar','Manabí','Other'));
alter table weavers add constraint wv_bio_chk check (bio is null or char_length(bio) <= 200);
```

Grade vs rows mismatch is **not** a constraint: the seed (and real life) contains mismatched records that must be flagged, not rejected.

### 5.2 Database guard: forward-only stages and version bump

```sql
create or replace function hats_before_update() returns trigger language plpgsql as $$
begin
  if new.stage < old.stage or new.stage > old.stage + 1 then
    raise exception 'stage_rule' using detail = format('%s -> %s', old.stage, new.stage);
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;
create trigger hats_guard before update on hats for each row execute function hats_before_update();
```

This applies to every writer, including `apply-proposals` with the service role.

### 5.3 RPC `advance_hat` (security invoker, so RLS applies)

```sql
create or replace function advance_hat(p_code text, p_expected_version int, p_note text default null)
returns table (code text, stage smallint, version int)
language plpgsql security invoker set search_path = public as $$
declare h hats%rowtype;
begin
  select * into h from hats where hats.code = p_code;
  if not found then raise exception 'not_found'; end if;
  if h.archived then raise exception 'archived'; end if;
  if h.owner_type <> 'workshop' or h.transfer_email is not null then raise exception 'not_owner'; end if;
  if h.stage >= 4 then raise exception 'finished'; end if;

  update hats set stage = h.stage + 1
   where id = h.id and hats.version = p_expected_version
   returning * into h;
  if not found then raise exception 'version_conflict'; end if;

  insert into hat_events (hat_id, type, from_stage, to_stage, actor_id, source, note)
  values (h.id, 'stage_advanced', h.stage - 1, h.stage, auth.uid(), 'manual',
          nullif(left(trim(coalesce(p_note, '')), 500), ''));
  return query select h.code, h.stage, h.version;
end $$;
grant execute on function advance_hat(text, int, text) to authenticated;
```

### 5.4 RPC `create_hat` (security invoker)

```sql
create or replace function create_hat(p_code text, p_weaver_id uuid, p_grade text, p_rows int,
  p_straw text, p_size int, p_price numeric, p_note text)
returns table (id uuid, code text)
language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if not exists (select 1 from weavers w where w.id = p_weaver_id
                 and w.workshop_id = my_workshop_id()) then
    raise exception 'weaver_not_found';
  end if;
  insert into hats (code, workshop_id, weaver_id, grade, rows_per_inch, straw, size_cm, price_usd,
                    stage, owner_type, archived, version, weaving_started_at)
  values (p_code, my_workshop_id(), p_weaver_id, p_grade, p_rows, p_straw, p_size, p_price,
          0, 'workshop', false, 1, now())
  returning hats.id into v_id;
  insert into hat_events (hat_id, type, to_stage, actor_id, source, note)
  values (v_id, 'created', 0, auth.uid(), 'manual', nullif(left(trim(coalesce(p_note,'')),500),''));
  return query select v_id, p_code;
end $$;
grant execute on function create_hat(text, uuid, text, int, text, int, numeric, text) to authenticated;
```

A duplicate code raises `23505` (unique violation); the server action retries with a new code.

### 5.5 Transfer, archive, review (plain updates through RLS)

```sql
-- transfer (server action, 2 statements in one RPC for atomicity)
create or replace function transfer_hat(p_code text, p_expected_version int, p_to text, p_email text, p_message text)
returns void language plpgsql security invoker set search_path = public as $$
declare h hats%rowtype;
begin
  if p_to not in ('seller','buyer') then raise exception 'invalid_target'; end if;
  update hats set owner_type = p_to, transfer_email = lower(trim(p_email))
   where code = p_code and version = p_expected_version and owner_type = 'workshop'
     and transfer_email is null and not archived
   returning * into h;
  if not found then raise exception 'version_conflict'; end if;
  insert into hat_events (hat_id, type, actor_id, source, note)
  values (h.id, 'transferred', auth.uid(), 'manual', nullif(left(trim(coalesce(p_message,'')),500),''));
end $$;
```

`archive_hat(p_code, p_expected_version)` follows the same shape: `update hats set archived = true where ... and not archived`, then an `archived` event. Flag review is a single update:

```sql
update hat_flags set reviewed_by = auth.uid(), review_reason = $reason, reviewed_at = now()
where id = $flag_id and reviewed_at is null;   -- 0 rows means already reviewed
```

plus an insert into `hat_events` (`type = 'flag_reviewed'`, `note = reason`). Two statements; acceptable because the flag row is the source of truth (see Open questions).

## 6. Server logic and API

All mutations are Next.js **server actions** in `app/hats/actions.ts` and `app/weavers/actions.ts`, using the user's Supabase session (RLS applies). They import pure rules from `@domain/domain`. Each returns `Result<T> = { ok: true; data: T } | { ok: false; code: string; message: string; requestId: string }`.

### 6.1 Domain functions used (from `domain.ts`)

```ts
nextStage(stage: number): number | null                 // 4 -> null
gradeFor(rows: number): Grade | null                    // 18 -> "Fino", 7 -> null
gradeMismatch(grade: Grade, rows: number): boolean       // ("Superfino", 18) -> true
canAdvance(hat: { stage: number; owner_type: OwnerType; transfer_email: string | null; archived: boolean },
           to: number, actor: { workshopId: string; hatWorkshopId: string })
  : { ok: true } | { ok: false; reason: "finished" | "skip" | "backward" | "not_owner" | "archived" | "other_workshop" }
generateCode(rand: () => number): string                 // "TQ-" + 5 chars of CODE_ALPHABET
isValidCode(code: string): boolean
```

`generateCode`: `"TQ-" + Array.from({length:5}, () => CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]).join("")`. Server passes `cryptoRand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2**32`. 32^5 = 33.5M codes.

### 6.2 `advanceHat`

```ts
export async function advanceHat(i: { code: string; expectedVersion: number; note?: string }): Promise<Result<{ stage: number; version: number }>> {
  const requestId = newRequestId(); const t0 = Date.now();
  if (!isValidCode(i.code)) return fail("invalid_code", "Codes look like TQ-7F3K2.");
  const hat = await sb.from("hats").select("id,stage,owner_type,transfer_email,archived,workshop_id,version").eq("code", i.code).single();
  if (!hat.data) return fail("not_found", "Hat not found.");
  const to = hat.data.stage + 1;
  const rule = canAdvance(hat.data, to, { workshopId: profile.workshop_id, hatWorkshopId: hat.data.workshop_id });
  if (!rule.ok) { await log("warn", "hat.stage.advance", { ok:false, reason: rule.reason }); return fail(rule.reason, COPY[rule.reason]); }
  const { data, error } = await sb.rpc("advance_hat", { p_code: i.code, p_expected_version: i.expectedVersion, p_note: i.note ?? null });
  if (error) { const code = mapDbError(error); await log(code === "version_conflict" ? "warn" : "error", ...); return fail(code, COPY[code]); }
  await log("info", "hat.stage.advance", { from: STAGES[to-1], to: STAGES[to], version: data[0].version, has_note: !!i.note });
  revalidatePath(`/hats/${i.code}`); revalidatePath("/hats");
  return { ok: true, data: { stage: data[0].stage, version: data[0].version } };
}
```

`mapDbError(error)`: maps `error.message` in {`not_found`,`archived`,`not_owner`,`finished`,`version_conflict`,`weaver_not_found`,`stage_rule`} to itself, `error.code === "23505"` to `duplicate_code`, else `unknown`.

`COPY`: `finished` "This hat is finished.", `not_owner` "Only the current owner can change the stage.", `archived` "This hat is archived.", `version_conflict` "Couldn't save this change. Someone may have updated this hat.", `skip`/`backward`/`stage_rule` "Stages can't be skipped.", `unknown` "Something went wrong. Try again."

**Client (optimistic):** on confirm, set local `stage = stage + 1`, close dialog, call action. On `ok:false`, restore previous stage and version, show error toast (with **Refresh** for `version_conflict`). On ok, store new `version` and show success toast. `router.refresh()` reloads events.

### 6.3 `createHat` (Nice)

1. Validate with `validateHatInput` (pure): weaver required, rows 6..40 integer, grade in list, `!gradeMismatch(grade, rows)`, straw in list, size null or 52..64, price null or 0..10000, note ≤ 500.
2. For `attempt` 1..5: `code = generateCode(cryptoRand)`; `rpc("create_hat", ...)`. On `duplicate_code`, continue. Other error: fail.
3. After 5 duplicates: fail `code_exhausted` (log error).
4. Log `hat.create` with `{ code, grade, rows_per_inch, weaver_id, attempts }`.

### 6.4 `transferHat`, `archiveHat`, `reviewFlag` (Nice)

- `transferHat({code, expectedVersion, to, email, message})`: email regex + `canAdvance`-style owner check in TS (`owner_type === 'workshop' && !transfer_email && !archived`), then `rpc("transfer_hat")`. Log `hat.transfer` with `{ to, email_domain }`.
- `archiveHat({code, expectedVersion})`: `rpc("archive_hat")`. Log `hat.archive`.
- `reviewFlag({flagId, reason})`: reason trimmed 3..300 chars, update (5.5); if 0 rows, `already_reviewed` ("This flag was already reviewed."). Insert event. Log `hat.flag.review` with `{ flag_id, kind, reason_length }`.

### 6.5 Weavers (Nice)

- `saveWeaver({id?, name, village, province, specialty, weavingSince, bio, showName, force})`.
- Validate: name 1..80, village 1..60, province in list, specialty ⊆ grades, weavingSince null or 1940..current year, bio ≤ 200.
- If no `id` and not `force`: `select id from weavers where workshop_id = me and lower(name) = lower($name) and lower(village) = lower($village)`. Found: return `{ ok:false, code:"duplicate" }` so the dialog shows the warning and **Add anyway** resubmits with `force: true`.
- Insert (with `workshop_id = profile.workshop_id`) or update by id. Log `weaver.create` or `weaver.edit` with `{ weaver_id, fields_changed? }`.

### 6.6 Reads (server components)

- List: `hats` select `code, grade, rows_per_inch, stage, owner_type, transfer_email, updated_at, weaver:weavers(name, village), flags:hat_flags(id, message, reviewed_at)` where `archived = false`, order `updated_at desc`, limit 200. Open flag count computed in TS (`reviewed_at == null`).
- Detail: hat by code + weaver + workshop name + `hat_events` (with `actor:profiles(name)`) ordered `created_at` + `hat_flags`.
- Activity text by `type`: created "Created at Weaving", stage_advanced "Moved to {to}", transferred "Transferred to a {owner_type}", claimed "Claimed by the buyer", archived "Archived", flag_reviewed "Flag reviewed: '{note}'".
- Timeline step date: the `stage_advanced` event whose `to_stage` = step; Weaving uses `weaving_started_at`. "Approved by" = actor name; source tag from `source`.

## 7. Business rules and edge cases

1. `nextStage(0)` is 1; `nextStage(4)` is null.
2. Advance moves exactly one step: stage 1 becomes 2, never 3.
3. A finished hat (stage 4) cannot advance; button disabled with "This hat is finished."
4. A transferred hat (`owner_type` seller/buyer or `transfer_email` set) cannot advance; "Only the current owner can change the stage."
5. An archived hat cannot advance, transfer or be archived again.
6. Two tabs on version 3: the first advance succeeds (version 4); the second returns `version_conflict` and the UI reverts.
7. A direct `update hats set stage = stage + 2` (any role, including service role) fails with `stage_rule`.
8. A direct `update hats set stage = stage - 1` fails with `stage_rule`.
9. Manual create with Fino and 30 rows is rejected by `validateHatInput` and the button stays disabled; Fino with 18 succeeds.
10. Rows 5 or 41 rejected; size 51 rejected; size empty allowed.
11. A new hat starts at stage 0 (Weaving), owner workshop, version 1, with one `created` event.
12. Generated codes always match `HAT_CODE_RE` and never contain I, O, 0 or 1.
13. On a code collision, create retries with a new code; the user never sees the collision.
14. Creating a hat with another workshop's weaver id fails with `weaver_not_found`.
15. Marking a flag reviewed requires a reason of at least 3 characters; reviewing twice returns `already_reviewed`.
16. Every successful advance writes exactly one `hat_events` row with `source = 'manual'` and the actor id.
17. A member opening another workshop's hat code gets a 404.
18. Archived hats do not appear on `/hats` but `/hat/[code]` still works.
19. Adding "rosa pillco" from "sígsig" when "Rosa Pillco, Sígsig" exists shows the duplicate warning (case-insensitive, accents compared as stored); **Add anyway** creates it.
20. Admin sees ⋯ items View in agent runs and View logs for this hat; member does not.

## 8. Logging

`source: "web"`, `request_id` per action, `hat_code` set when known, `duration_ms` = action time.

| Action | Level | payload |
|---|---|---|
| `hat.stage.advance` | info / warn (rule or conflict) / error | `{ ok, from, to, version?, reason?, has_note }` |
| `hat.create` | info / error | `{ ok, code, grade, rows_per_inch, weaver_id, attempts, error_code? }` |
| `hat.flag.review` | info / warn | `{ ok, flag_id, kind, reason_length }` (reason text is in `hat_events`, not duplicated) |
| `hat.transfer` | info / warn | `{ ok, to, email_domain }` (full email stays in `hats.transfer_email`) |
| `hat.archive` | info / warn | `{ ok }` |
| `weaver.create` | info | `{ weaver_id, province, forced_duplicate }` |
| `weaver.edit` | info | `{ weaver_id, fields_changed: string[] }` |

Logging is wrapped in try/catch and never fails the action.

## 9. Security and privacy

- All reads and writes go through the user's session; RLS (spec 01) limits members to their workshop. RPCs are `security invoker`, so they cannot bypass RLS.
- Rules are checked three times on purpose: UI (disabled button), TS domain in the server action (clear message), database trigger (last line, covers every writer).
- Version check prevents lost updates between people and between a person and an approved AI proposal.
- `transfer_email` is never shown on the public passport and is logged only as a domain.
- Weaver privacy: `show_name = false` hides the name on passports (spec for passport reads it via `public_hat_passport`).
- Admins get links only; no cross-workshop write paths.

## 10. Tests

**Unit (Vitest, `tests/domain.hats.test.ts`)**

| Function | Input | Expected |
|---|---|---|
| `nextStage` | `0` / `3` / `4` | `1` / `4` / `null` |
| `canAdvance` | `{stage:1, owner_type:"workshop", transfer_email:null, archived:false}`, to `2`, same workshop | `{ ok: true }` |
| `canAdvance` | same, to `3` | `{ ok:false, reason:"skip" }` |
| `canAdvance` | same, to `0` | `{ ok:false, reason:"backward" }` |
| `canAdvance` | stage `4`, to `5` | `{ ok:false, reason:"finished" }` |
| `canAdvance` | `owner_type:"buyer"` | `{ ok:false, reason:"not_owner" }` |
| `canAdvance` | `archived:true` | `{ ok:false, reason:"archived" }` |
| `canAdvance` | different workshop ids | `{ ok:false, reason:"other_workshop" }` |
| `gradeFor` | `8`, `14`, `15`, `24`, `25`, `40`, `7` | Standard, Standard, Fino, Fino, Superfino, Superfino, `null` |
| `gradeMismatch` | `("Superfino", 18)` / `("Fino", 18)` | `true` / `false` |
| `generateCode` | `rand = () => 0` | `"TQ-AAAAA"` |
| `generateCode` | `rand = () => 0.9999` | `"TQ-99999"` |
| `generateCode` | 1000 calls with `Math.random` | all match `HAT_CODE_RE`, none contain `I`,`O`,`0`,`1` |
| `validateHatInput` | Fino, rows 30 | error `rows_per_inch: "30 rows/inch usually means Superfino."` |
| `validateHatInput` | size `51` | error on `size_cm` |
| `mapDbError` | `{ code: "23505" }` | `"duplicate_code"` |
| `mapDbError` | `{ message: "version_conflict" }` | `"version_conflict"` |
| `activityText` | `{type:"stage_advanced", to_stage:2}` | `"Moved to Bleaching"` |

**Integration (local Supabase, `tests/hats.sql` or Vitest with a test user)**
- `advance_hat('TQ-7F3K2', <current version>)` returns stage 2 and version + 1; one new `hat_events` row.
- Same call again with the old version raises `version_conflict`.
- `update hats set stage = 4 where code = 'TQ-2C5P0'` as service role raises `stage_rule`.
- `advance_hat('TQ-9A1M8', v)` raises `finished`.
- `create_hat` with a duplicate code raises `23505`.
- Member of workshop B: `advance_hat('TQ-7F3K2', v)` raises `not_found` (RLS hides the row).

## 11. Acceptance criteria

- [ ] Seeded member opens `/hats` and sees 5 hats with stepper, grade and owner; on a 390px screen they are cards.
- [ ] Opening TQ-7F3K2 shows Washing as current, Weaving done with "Approved by Xavier" and a source tag.
- [ ] **Advance to Bleaching** opens "Move TQ-7F3K2 to Bleaching?"; confirming shows "TQ-7F3K2 moved to Bleaching." and a new Activity row.
- [ ] With the hat open in two tabs, advancing in tab 1 then tab 2 shows "Couldn't save this change. Someone may have updated this hat." in tab 2 and the stage reverts.
- [ ] TQ-9A1M8 shows the Advance button disabled with "This hat is finished."
- [ ] As admin, the ⋯ menu on a hat shows View in agent runs and View logs for this hat; as member it does not.
- [ ] As admin, Logs shows a `hat.stage.advance` row with the hat code and request id.
- [ ] (Nice) TQ-4K9D1 shows the flag; Mark as reviewed with a reason turns it muted with "Reviewed by Xavier: '...'".
- [ ] (Nice) Add a hat manually with Fino 18 shows "TQ-XXXXX created." and the hat opens at Weaving.
- [ ] (Nice) Add a weaver; adding the same name and village again shows the duplicate warning.

## 12. Build plan

Share of 2 hours: **20 minutes for Must** (inside the README's "Schema" and "Seed data" slices). Nice items are built only if the Must line of every spec is done, in this order.

| # | Task | Min | Level |
|---|---|---|---|
| 1 | Constraints, trigger, `advance_hat`, `create_hat` SQL | 4 | Must |
| 2 | `seed.sql` + `scripts/seed-users.ts` (section 12a) | 4 | Must |
| 3 | `/hats` list (table + cards, loading/empty) | 5 | Must |
| 4 | `/hats/[code]` detail: header, timeline, details, ownership, activity, admin links | 4 | Must |
| 5 | Advance dialog + server action + optimistic revert + tests | 3 | Must |
| | **Must total** | **20** | |
| 6 | Flags panel + Mark as reviewed | 6 | Nice |
| 7 | Manual create dialog + `createHat` + tests | 8 | Nice |
| 8 | Weavers grid + add/edit dialog | 10 | Nice |
| 9 | Search + Flagged only chip | 4 | Nice |
| 10 | Transfer dialog + `transfer_hat` | 6 | Nice |
| 11 | Archive + Share copy link | 4 | Nice |

### 12a. Seed data (handoff "Sample data", dates relative to 2026-10-18)

`scripts/seed-users.ts` (service role, run locally, reads passwords from env) creates `xavier@tallerpillco.com` with metadata `{ name:"Xavier", workshop_name:"Taller Pillco", city:"Cuenca" }` and the admin (spec 01). `seed.sql` then uses `ws := (select workshop_id from profiles p join auth.users u on u.id = p.id where u.email = 'xavier@tallerpillco.com')` and `x := that user's id`.

| Weaver | Village, Province | Since | Specialty | show_name |
|---|---|---|---|---|
| Rosa Pillco | Sígsig, Azuay | 1992 | {Fino} | true |
| Rosa Guamán | Cuenca, Azuay | null | {Standard} | true |
| Manuel Delgado | Pile, Manabí | 1985 | {Superfino} | true |
| Carmen Quizhpi | Cuenca, Azuay | null | {Fino} | true |

| Code | Grade | Rows | Weaver | Stage | Owner | weaving_started_at | Events (to_stage, date, source) |
|---|---|---|---|---|---|---|---|
| TQ-7F3K2 | Fino | 18 | Rosa Pillco | 1 Washing | workshop | 2026-08-01 | created 0 (Aug 1, manual), 1 (Oct 14, ai_proposal) |
| TQ-9A1M8 | Superfino | 32 | Manuel Delgado | 4 Finished | buyer, `transfer_email` = `buyer@example.com` | 2026-05-12 | 0 (May 12), 1 (Sep 10), 2 (Sep 18), 3 (Sep 26), 4 (Oct 2), transferred (Oct 10) |
| TQ-2C5P0 | Standard | 10 | Rosa Guamán | 0 Weaving | workshop | 2026-10-06 | created 0 (Oct 6) |
| TQ-4K9D1 | Superfino | 18 | Carmen Quizhpi | 3 Blocking | workshop | 2026-07-15 | 0 (Jul 15), 1 (Sep 20), 2 (Sep 30), 3 (Oct 12) |
| TQ-8B2N4 | Fino | 20 | Carmen Quizhpi | 1 Washing | workshop | 2026-08-10 | 0 (Aug 10), 1 (Oct 16) |

Seed rows: sizes 57 to 59, straw Natural (TQ-9A1M8 Natural, TQ-4K9D1 Bleached), prices 45 to 350, TQ-9A1M8 size 58. All events `actor_id = x`. Seed inserts set `stage` directly with the trigger only on update, so inserts are allowed. Flag: `hat_flags` on TQ-4K9D1, `kind = 'grade_mismatch'`, `message = 'Grade says Superfino, but 18 rows per inch usually means Fino.'`, `raised_by = 'system'`.

## 13. Interview talking points

- **Rules in three layers:** the UI explains, the TS domain function gives a precise message, the trigger guarantees it for every writer, including the AI path through `apply-proposals`. I can point at each line.
- **Optimistic locking with `version`:** cheap, no locks held, and it handles the realistic race (a person advances while someone approves an AI proposal for the same hat).
- **`advance_hat` as one RPC:** the stage change and its history row commit together; `hat_events` stays append-only.
- **Security invoker RPCs:** I didn't open a hole around RLS to get atomicity.
- **Codes without I, O, 0, 1:** codes are read aloud and typed from tags; ambiguous characters cause support tickets. Collisions are retried, not prevented by a sequence, so codes stay unguessable.
- **What I cut and why:** filters, bulk, export and pagination add nothing at 5 to 50 hats; the agent is the product, these screens prove it saved real data.
- **Extending in 45 minutes:** Stage/Grade filters as URL params on the same query, bulk advance reusing `advance_hat` per hat with per-row results, CSV export from the same select, edit details with the same validator plus a `hat.edit` event and diff in `note`.

## 14. Open questions

1. **`canAdvance` signature and return shape** are not defined in conventions. This spec proposes `{ ok: true } | { ok: false, reason }`; the domain spec should confirm so `apply-proposals` uses the same reasons.
2. **`hat_events.type` vocabulary** is not in conventions. Proposed: `created, stage_advanced, transferred, claimed, archived, flag_reviewed, edited`.
3. **Manual create notes:** `hats` has no notes column. Notes are stored on the `created` event's `note`.
4. **Transfer without email:** conventions cut transfer emails, but the handoff toast says "Transfer recorded. They can claim it from the hat's passport." (D20) Keep the copy (the passport claim works by email match), or change it to "Transfer recorded for ana@shop.com."?
5. **"This hat is archived."** is new copy, not in the handoff.
6. **Flag review is two statements** (update flag, insert event). Make it an RPC if time allows.
7. **`apply-proposals` should call `advance_hat` / `create_hat`** (with a service-role variant that takes `actor_id`, `source = 'ai_proposal'`, `run_id`) so manual and AI paths share one write path. Needs agreement with the apply-proposals spec.
8. **Owner model:** this spec sets `owner_type` to `seller`/`buyer` at transfer time and `owner_user_id` at claim time. Conventions don't say which field changes when. The passport/claim spec must match.
9. **`HAT_CODE_RE` allows 0, 1, I, O** (seed code TQ-2C5P0 has a 0) while `CODE_ALPHABET` excludes them. Fine for validation, but fuzzy matching of spoken codes should treat O/0 and I/1 as equal.
