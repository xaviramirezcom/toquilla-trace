# 05. Domain rules (`supabase/functions/_shared/domain.ts`)

## 1. Summary

One pure TypeScript module with zero imports holds every business rule: the stage machine, grade ranges, ownership checks, hat code validation and matching, and anomaly detection. The agent's tool handlers, `apply-proposals`, the Next.js UI and Vitest all import the same functions, and SQL constraints mirror them as the last line of defense.

**Evaluation criteria served:** rules in code not prompts, when not to use an LLM, least privilege (ownership checks), tests as a contract, and defense in depth (three enforcement layers).

## 2. Scope

| Item | Must/Nice/Cut | Why |
|---|---|---|
| Constants from 00 section 2 | Must | Shared names |
| Stage machine: `nextStage`, `stageIndex`, `stageName`, `canAdvance` | Must | Core rule, blocked card copy |
| Grades: `gradeFor`, `gradeMismatch`, `gradeMismatchMessage`, `validateRows` | Must | Grade rule and "Use Fino" fix |
| Codes: `isValidCode`, `normalizeCode`, `canonicalCode`, `matchCode`, `generateCode` | Must | Code input, misheard codes, new hats |
| Text: `foldText`, `quoteInNote`, `matchWeavers` | Must | Agent grounding and weaver lookup |
| Anomalies: `minWeavingDays`, `weavingDays`, `detectAnomalies` | Must | Flags in the sample data |
| `validateHatFields` (quantity, size, price, straw) | Must | Manual create and edit proposal forms |
| SQL constraints and stage trigger | Must | Last line of defense |
| `canTransfer`, `canClaim` | Nice | Transfer emails are Cut; functions are cheap and tested |
| Spoken code variants ("te cu siete efe tres ka dos") | Cut | Needs a phonetic layer |
| Seller and buyer flows in UI | Cut | Transfer is Cut in 00 section 7 |

## 3. User stories

- **Workshop member:** I can't skip a stage or move a hat backward, and the app tells me the next allowed stage.
- **Workshop member:** when I type 18 rows per inch with Superfino, I see "18 rows/inch usually means Fino." and a one-tap fix.
- **Workshop member:** typing "tq7f3k2" in a code field becomes `TQ-7F3K2`.
- **Buyer:** a passport for a Superfino that was "woven in 23 days" carries a flag, so grades are checked, not just claimed.
- **Developer:** I can change a rule in one place and the tests tell me everything it affects.

## 4. UI

Where these rules surface (copy is final, from the handoff):

| Rule | UI | Copy |
|---|---|---|
| `canAdvance` stage_skip | Stage selects disable non-next stages; blocked proposal card | "Stages can't be skipped." / "Can't move TQ-2C5P0 from Weaving to Finished. Next allowed stage: Washing." |
| `canAdvance` not_owner | Disabled Advance button with reason | "Only the current owner can change the stage." |
| `gradeMismatchMessage` | Inline warning under Rows/inch with "Use Fino" | "18 rows/inch usually means Fino." |
| `normalizeCode` / `isValidCode` | Code inputs (auto-uppercase, auto-hyphen, max 8 chars) | "Codes look like TQ-7F3K2." |
| `detectAnomalies` | Flags panel on hat detail, flag tile on dashboard | Flag message per kind (section 6.6) |
| `validateRows` | Rows/inch field (6 to 40) | "Rows per inch must be between 6 and 40." |

## 5. Data

No new tables. Columns used: `hats.code, workshop_id, weaver_id, grade, rows_per_inch, straw, size_cm, price_usd, stage, owner_type, owner_user_id, transfer_email, archived, version, weaving_started_at, created_at`; `hat_events.type, from_stage, to_stage, created_at`.

**SQL that mirrors the rules** (goes in `0001_init.sql`):

```sql
-- Mirrors GRADE_RANGES (keep in sync with domain.ts; a test compares both)
create or replace function grade_for_rows(r int) returns text language sql immutable as $$
  select case when r between 8 and 14 then 'Standard'
              when r between 15 and 24 then 'Fino'
              when r between 25 and 40 then 'Superfino' end $$;

alter table hats
  add constraint hats_code_format  check (code ~ '^TQ-[A-Z0-9]{5}$'),
  add constraint hats_stage_range  check (stage between 0 and 4),
  add constraint hats_rows_range   check (rows_per_inch between 6 and 40),
  add constraint hats_grade_enum   check (grade in ('Standard','Fino','Superfino')),
  add constraint hats_owner_enum   check (owner_type in ('workshop','seller','buyer')),
  add constraint hats_owner_user   check (owner_type <> 'workshop' or owner_user_id is null),
  add constraint hats_size_range   check (size_cm is null or size_cm between 52 and 64),
  add constraint hats_price_nonneg check (price_usd is null or price_usd >= 0),
  add constraint hats_straw_enum   check (straw is null or straw in ('Natural','Bleached','Dyed'));

create or replace function hats_guard() returns trigger language plpgsql as $$
begin
  -- Grade vs rows is NOT enforced here (decision D10 in 00-conventions): imported or
  -- legacy records can be wrong, and that is exactly what the grade_mismatch flag is for.
  -- New writes from this app are checked in code (tool handlers + apply-proposals).
  if tg_op = 'UPDATE' then
    if new.stage <> old.stage and new.stage <> old.stage + 1 then
      raise exception 'stage_skip: % to %', old.stage, new.stage using errcode = 'check_violation';
    end if;
    if old.archived and new.stage <> old.stage then
      raise exception 'archived' using errcode = 'check_violation';
    end if;
    if new.version <> old.version + 1 then
      raise exception 'version_conflict' using errcode = 'serialization_failure';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger hats_guard before insert or update on hats for each row execute function hats_guard();

alter table hat_events
  add constraint hat_events_one_step check (type <> 'stage_advance' or to_stage = from_stage + 1);
create or replace function hat_events_append_only() returns trigger language plpgsql as $$
begin raise exception 'hat_events is append-only'; end $$;
create trigger hat_events_no_change before update or delete on hat_events
  for each row execute function hat_events_append_only();
```

**Seed note:** sample hat TQ-4K9D1 ("Superfino" at 18 rows) breaks the grade rule on purpose (it is the flagged example). `seed.sql` inserts it with `alter table hats disable trigger hats_guard;` ... `enable trigger` around that one insert, with a comment "legacy record imported before rules, flagged". App writes can never create such a row.

**RLS (ownership as last line):** the `hats` update policy allows members only when `workshop_id = my_workshop() and owner_type = 'workshop'`; seller and buyer updates require `owner_user_id = auth.uid()`. `apply-proposals` writes with the user-scoped client so this policy applies.

## 6. Server logic and API

### 6.1 Types

```ts
export const STAGES = ["Weaving", "Washing", "Bleaching", "Blocking", "Finished"] as const;
export type Stage = (typeof STAGES)[number];
export type StageIndex = 0 | 1 | 2 | 3 | 4;
export type Grade = "Standard" | "Fino" | "Superfino";
export const GRADES: readonly Grade[] = ["Standard", "Fino", "Superfino"];
export const GRADE_RANGES: Record<Grade, [number, number]> = { Standard: [8, 14], Fino: [15, 24], Superfino: [25, 40] };
export const ROWS_MIN = 6, ROWS_MAX = 40;
export const HAT_CODE_RE = /^TQ-[A-Z0-9]{5}$/;
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export type OwnerType = "workshop" | "seller" | "buyer";

export interface HatLike {
  code: string; workshop_id: string; weaver_id: string | null; grade: Grade; rows_per_inch: number;
  stage: number; owner_type: OwnerType; owner_user_id: string | null; transfer_email: string | null;
  archived: boolean; weaving_started_at: string | null; created_at: string;
}
export interface HatEventLike { type: string; from_stage: number | null; to_stage: number | null; created_at: string }
export interface Actor { userId: string; workshopId: string | null; role: "member" | "admin"; email?: string }

export type RuleCode = "invalid_stage" | "archived" | "not_owner" | "already_finished" | "same_stage"
  | "backward" | "stage_skip" | "end_of_chain" | "invalid_email" | "no_transfer" | "not_recipient";
export type RuleResult =
  | { allowed: true }
  | { allowed: false; code: RuleCode; message: string; fix?: { to_stage: StageIndex } };
export type AnomalyKind = "grade_mismatch" | "too_fast" | "weaver_not_found";
export interface Anomaly { kind: AnomalyKind; message: string }
export type CodeMatch =
  | { kind: "exact" | "confusable" | "fuzzy"; code: string }
  | { kind: "ambiguous"; candidates: string[] }
  | { kind: "none" };
```

Dates are ISO strings. Functions that need "now" take it as a parameter, so the module stays pure and deterministic.

### 6.2 Stage machine

```
Weaving(0) -> Washing(1) -> Bleaching(2) -> Blocking(3) -> Finished(4)
```

| Function | Behaviour |
|---|---|
| `stageName(i: number): Stage \| null` | `STAGES[i]` for integers 0 to 4, else null |
| `stageIndex(name: string): StageIndex \| null` | Case-insensitive, trimmed English name to index. Spanish words return null (language is the model's job) |
| `nextStage(i: StageIndex): StageIndex \| null` | `i + 1`, or null at 4 |
| `canAdvance(hat, to, actor): RuleResult` | Checks in this exact order, first failure wins (below) |

`canAdvance` order and messages:
1. `to` not an integer 0 to 4: `invalid_stage`, "That stage doesn't exist."
2. `hat.archived`: `archived`, "Archived hats can't change stage."
3. `!isOwner(hat, actor)`: `not_owner`, "Only the current owner can change the stage."
4. `hat.stage === 4`: `already_finished`, "{code} is already Finished."
5. `to === hat.stage`: `same_stage`, "{code} is already at {Stage}."
6. `to < hat.stage`: `backward`, "Stages only move forward. {code} is at {Stage}."
7. `to > hat.stage + 1`: `stage_skip`, "Can't move {code} from {From} to {To}. Next allowed stage: {Next}.", `fix: { to_stage: hat.stage + 1 }`
8. Otherwise `{ allowed: true }`.

`isOwner(hat, actor)` (exported): `owner_type === "workshop"` requires `actor.workshopId === hat.workshop_id`; `seller` or `buyer` requires `actor.userId === hat.owner_user_id` (null owner user means nobody, pending claim). **Admins get no bypass**: admin is a read role for debugging, not a write role.

Ownership is checked before stage logic so a non-owner learns nothing about the hat's stage.

### 6.3 Grades

| Function | Behaviour |
|---|---|
| `gradeFor(rows: number): Grade \| null` | Integer 8 to 14 Standard, 15 to 24 Fino, 25 to 40 Superfino. Non-integer, below 8 or above 40: null |
| `gradeMismatch(grade, rows): boolean` | `gradeFor(rows) !== grade` (so rows 6 or 7 always mismatch) |
| `gradeMismatchMessage(grade, rows): string \| null` | null if no mismatch. If `gradeFor(rows)` exists: "{rows} rows/inch usually means {Grade}." Else: "{rows} rows/inch is below the Standard range (8 to 14)." |
| `validateRows(rows): string \| null` | null if integer 6 to 40, else "Rows per inch must be between 6 and 40." |

Rows 6 and 7 are accepted as input (00 says `ROWS_MIN = 6`, for very coarse hats) but have no grade, so any grade mismatches and creation is blocked until a person decides.

### 6.4 Hat codes

| Function | Behaviour |
|---|---|
| `isValidCode(s): boolean` | `HAT_CODE_RE.test(s)`. Strict: lowercase or missing hyphen is false. Validate after normalizing |
| `normalizeCode(input): string \| null` | Trim, uppercase, remove spaces, hyphens, dots, underscores, quotes. If it starts with `TQ` and has 7 chars, body = last 5; if it has exactly 5 chars, body = all. Body must be `[A-Z0-9]{5}`. Returns `"TQ-" + body`, else null. Does **not** swap O and 0 (both are legal in the regex) |
| `canonicalCode(code): string` | For comparison only: on the body, `O` to `0`, `I` and `L` to `1`. `TQ-2C5PO` gives `TQ-2C5P0` |
| `matchCode(input, candidates): CodeMatch` | See below |
| `generateCode(rand: () => number): string` | `"TQ-"` + 5 chars, each `CODE_ALPHABET[Math.floor(rand() * 32)]`. Clamp index to 31. Caller retries up to 5 times on unique violation |

`matchCode(input, candidates)` tiers, first tier with any hit wins:
1. `exact`: `normalizeCode(input)` equals a candidate.
2. `confusable`: `canonicalCode` of the normalized input equals `canonicalCode` of a candidate.
3. `fuzzy`: build the raw body (uppercase, alphanumerics only, leading `TQ` removed when the rest is 4 to 6 chars). Canonicalize it, then Levenshtein distance at most 1 against each canonical candidate body.
4. One hit: `{kind, code}`. Two or more hits in the same tier: `{ kind: "ambiguous", candidates }`. No hit: `{ kind: "none" }`.

Callers pass all workshop hats for tier 1 and only open hats for tiers 2 and 3 (03 section 6.8), so a fuzzy match never lands on a finished or archived hat.

Generated codes avoid I, O, 0 and 1 so new codes are never confusable. Seed codes (TQ-2C5P0, TQ-9A1M8, TQ-4K9D1) contain 0 and 1 and stay valid because the regex allows them; the confusable tier exists for exactly these.

### 6.5 Text helpers

| Function | Behaviour |
|---|---|
| `foldText(s): string` | `normalize("NFD")`, strip combining marks, lowercase, replace curly quotes with straight ones, collapse whitespace, trim |
| `quoteInNote(quote, note): boolean` | Fold both; strip wrapping quotes and trailing punctuation `.,;:!?` from the quote; false if the folded quote is under 3 chars or over 160; else `foldedNote.includes(foldedQuote)` |
| `matchWeavers(query, weavers): W[]` | Fold, drop honorifics (`dona`, `don`, `senora`, `sra`, `sr`, `la`, `el`), split into words. A weaver matches when every query word is a prefix of some word in the folded name. Empty query after honorifics: `[]`. Sorted by name, max 5 |

### 6.6 Anomalies

| Function | Behaviour |
|---|---|
| `minWeavingDays(grade): number` | Standard 2, Fino 14, Superfino 60 |
| `weavingDays(hat, events, now?): number \| null` | Start = `hat.weaving_started_at`, else null (unknown, no guess). End = `created_at` of the first event with `to_stage = 1`; if none and `now` is given, `now`; else null. Whole days, `Math.floor((end - start) / 86_400_000)` |
| `detectAnomalies(hat, events, now?): Anomaly[]` | In this order: `grade_mismatch` if `gradeMismatch(hat.grade, hat.rows_per_inch)`, message "{rows} rows/inch usually means {Grade}." (or the below-range text); `too_fast` only when the hat has left Weaving (an event to stage 1 exists, or the caller simulates one at `now`) and `weavingDays < minWeavingDays(grade)`, message "Woven in {n} days. {Grade} usually takes at least {min}."; `weaver_not_found` if `weaver_id` is null, message "No weaver is linked to this hat." |

**Why these thresholds.** Reported weaving times are roughly a few days for coarse Standard hats, several weeks for Fino and several months for Superfino (the finest take 6 months or more). The thresholds are deliberately low floors, well under typical times, so a flag means "probably impossible", not "a bit quick". The handoff review called out a Superfino woven in 23 days as wrong; 60 catches it with margin. Flags never block anything: a human reviews them. Thresholds are exported constants so they can be tuned with workshop data.

### 6.7 Transfer and claim (Nice)

| Function | Behaviour |
|---|---|
| `canTransfer(hat, actor, to: "seller" \| "buyer", email): RuleResult` | Order: `archived`; `!isOwner`: `not_owner`; `hat.owner_type === "buyer"`: `end_of_chain`, "A buyer is the last owner."; `hat.owner_type === "seller" && to === "seller"`: `end_of_chain`, "A seller can only transfer to a buyer."; email fails `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`: `invalid_email`, "Enter a valid email."; else allowed |
| `canClaim(hat, actor): RuleResult` | `archived`; `hat.transfer_email` null: `no_transfer`, "This hat has no pending transfer."; `foldText(actor.email) !== foldText(hat.transfer_email)`: `not_recipient`, "This transfer was sent to a different email."; else allowed |

### 6.8 Field validation

`validateHatFields(f: { quantity?, rows_per_inch?, grade?, size_cm?, price_usd?, straw? }): Record<string, string>` returns a map of field to message, empty when valid. Quantity integer 1 to 20 ("Quantity must be between 1 and 20."); rows via `validateRows`; grade in `GRADES` ("Pick a grade."); size null or integer 52 to 64 ("Size must be between 52 and 64 cm."); price null or number at least 0 ("Price can't be negative."); straw null or Natural, Bleached, Dyed ("Pick a straw color."). Grade mismatch is not a field error here; callers use `gradeMismatchMessage` so the UI can offer the fix.

### 6.9 Where each rule is enforced

| Rule | UI (hint only) | Agent tool handler (proposal time) | `apply-proposals` (write time, authoritative) | Database (last line) |
|---|---|---|---|---|
| Stage one step forward | Disabled options | `canAdvance`, stores `blocked` | `canAdvance` on fresh row, `version` match | `hats_guard` trigger, `hat_events_one_step` |
| Grade matches rows | Inline warning + fix | `gradeMismatch`, stores `blocked` | `gradeMismatch` on final payload (after edits) | Not enforced in SQL (existing records get a `grade_mismatch` flag instead, see D10) |
| Ownership | Disabled button + reason | `canAdvance` (`not_owner`) | `canAdvance` / `canTransfer` | RLS update policy |
| Code format | Input mask | `normalizeCode` | `isValidCode` on generated code | `hats_code_format` |
| Ranges (rows, size, price, qty) | Field errors | Handler range checks | `validateHatFields` | Check constraints |
| Archived is frozen | Hidden actions | `archived` block | `archived` block | Trigger |
| History append-only | n/a | n/a | Insert only | No update/delete policy + trigger |
| Anomalies | Flags panel | `detectAnomalies` warnings | Creates `hat_flags` on approval | n/a (advisory) |

The model never enforces a rule. Proposal-time checks give the human a clear card; write-time checks protect against stale data and edits; the database protects against bugs in both.

## 7. Business rules and edge cases

1. A hat moves exactly one stage forward per write. 0 to 2 is `stage_skip` with fix 1.
2. No backward moves, including from Finished.
3. A Finished hat cannot advance (`already_finished`), checked after ownership.
4. Ownership is checked before stage rules.
5. An admin who is not the owner cannot advance or transfer.
6. A hat owned by `seller` or `buyer` with `owner_user_id = null` cannot be advanced by anyone.
7. Grade boundaries are inclusive: 14 Standard, 15 Fino, 24 Fino, 25 Superfino.
8. Rows outside 6 to 40 or non-integer are invalid input; rows 6 and 7 are valid input with no grade.
9. `normalizeCode` is idempotent: `normalizeCode(normalizeCode(x)) === normalizeCode(x)` for valid results.
10. `normalizeCode` never maps O to 0; only `canonicalCode` does, for matching.
11. `matchCode` never returns a single code when two candidates tie in a tier.
12. `generateCode` output always matches `HAT_CODE_RE` and never contains I, O, 0 or 1.
13. `too_fast` is never raised when `weaving_started_at` is null.
14. The `too_fast` comparison is strict: exactly `minWeavingDays` days is fine.
15. `quoteInNote` ignores case, accents, curly vs straight quotes and extra spaces, but not changed words or numbers.
16. `matchWeavers("Rosa")` returns both Rosas; it never picks one.
17. `GRADE_RANGES` in TS and `grade_for_rows` in SQL agree for every integer 0 to 45 (integration test).

## 8. Logging

`domain.ts` is pure and never logs. Callers log every check that affects a decision:
- Agent handlers: `agent.rule.check` with payload `{ rule, hat_code, from, to, allowed, code, message, warnings }` (spec 03 section 8).
- `apply-proposals`: `proposal.apply_failed` with `{ rule, code, message }` when a re-check fails.
- UI: no log for hints; the server logs the authoritative result.
- Database rejections (trigger or constraint) surface as `proposal.apply_failed` or `hat.*` errors with `error.code` set to the Postgres error code (`23514` check_violation, `40001` serialization_failure).

## 9. Security and privacy

- Rules live in code and SQL, not in prompts, so a prompt injection cannot change them.
- No admin write bypass: least privilege for people too.
- `not_owner` is returned before any stage detail, so callers can't probe other workshops' hats.
- `matchCode` fuzzy tiers only search the caller's open hats, so fuzzy matching can't reveal codes from other workshops.
- The module has no I/O, no secrets, no network: it is safe to ship to the browser bundle.

## 10. Tests

`tests/domain.test.ts`, table-driven with `it.each`. Fixtures: `base = { code: "TQ-2C5P0", workshop_id: "w1", weaver_id: "v2", grade: "Standard", rows_per_inch: 10, stage: 0, owner_type: "workshop", owner_user_id: null, transfer_email: null, archived: false, weaving_started_at: null, created_at: "2026-10-01T00:00:00Z" }`; `member = { userId: "u1", workshopId: "w1", role: "member", email: "xavier@tallerpillco.com" }`. Sample weavers and open codes from the handoff.

| # | Call | Expected |
|---|---|---|
| 1 | `nextStage(0)` | `1` |
| 2 | `nextStage(3)` | `4` |
| 3 | `nextStage(4)` | `null` |
| 4 | `stageIndex("Bleaching")` | `2` |
| 5 | `stageIndex(" bleaching ")` | `2` |
| 6 | `stageIndex("blanqueo")` | `null` |
| 7 | `stageName(5)` | `null` |
| 8 | `canAdvance(base, 1, member)` | `{ allowed: true }` |
| 9 | `canAdvance({...base, code:"TQ-7F3K2", stage:1}, 2, member)` | `{ allowed: true }` |
| 10 | `canAdvance(base, 4, member)` | `{ allowed:false, code:"stage_skip", message:"Can't move TQ-2C5P0 from Weaving to Finished. Next allowed stage: Washing.", fix:{ to_stage:1 } }` |
| 11 | `canAdvance({...base, stage:3}, 1, member)` | `code:"backward"`, "Stages only move forward. TQ-2C5P0 is at Blocking." |
| 12 | `canAdvance({...base, stage:1}, 1, member)` | `code:"same_stage"`, "TQ-2C5P0 is already at Washing." |
| 13 | `canAdvance({...base, stage:4}, 4, member)` | `code:"already_finished"` |
| 14 | `canAdvance({...base, archived:true}, 1, member)` | `code:"archived"`, "Archived hats can't change stage." |
| 15 | `canAdvance({...base, workshop_id:"w2"}, 1, member)` | `code:"not_owner"`, "Only the current owner can change the stage." |
| 16 | `canAdvance({...base, owner_type:"seller", owner_user_id:"u9"}, 1, member)` | `code:"not_owner"` |
| 17 | `canAdvance(base, 1, {...member, workshopId:"w2", role:"admin"})` | `code:"not_owner"` (no admin bypass) |
| 18 | `canAdvance({...base, owner_type:"seller", owner_user_id:"u1", stage:3}, 4, member)` | `{ allowed: true }` |
| 19 | `canAdvance({...base, owner_type:"buyer", owner_user_id:null, stage:4}, 4, member)` | `code:"not_owner"` (ownership before finished) |
| 20 | `canAdvance(base, 7, member)` | `code:"invalid_stage"` |
| 21 | `gradeFor(8)` / `gradeFor(14)` | `"Standard"` / `"Standard"` |
| 22 | `gradeFor(15)` / `gradeFor(24)` | `"Fino"` / `"Fino"` |
| 23 | `gradeFor(25)` / `gradeFor(40)` | `"Superfino"` / `"Superfino"` |
| 24 | `gradeFor(7)` | `null` |
| 25 | `gradeFor(41)` | `null` |
| 26 | `gradeFor(18.5)` | `null` |
| 27 | `gradeMismatch("Fino", 18)` | `false` |
| 28 | `gradeMismatch("Superfino", 18)` | `true` |
| 29 | `gradeMismatch("Standard", 15)` | `true` |
| 30 | `gradeMismatch("Standard", 6)` | `true` |
| 31 | `gradeMismatchMessage("Superfino", 18)` | `"18 rows/inch usually means Fino."` |
| 32 | `gradeMismatchMessage("Standard", 7)` | `"7 rows/inch is below the Standard range (8 to 14)."` |
| 33 | `gradeMismatchMessage("Fino", 18)` | `null` |
| 34 | `validateRows(6)` / `validateRows(40)` | `null` / `null` |
| 35 | `validateRows(5)` / `validateRows(41)` / `validateRows(12.5)` | `"Rows per inch must be between 6 and 40."` (each) |
| 36 | `isValidCode("TQ-7F3K2")` | `true` |
| 37 | `isValidCode("tq-7f3k2")` | `false` |
| 38 | `isValidCode("TQ-7F3K")` / `isValidCode("TQ7F3K2")` | `false` / `false` |
| 39 | `normalizeCode("tq 7f3k2")` | `"TQ-7F3K2"` |
| 40 | `normalizeCode("TQ7F3K2")` | `"TQ-7F3K2"` |
| 41 | `normalizeCode("  TQ-7f3k2. ")` | `"TQ-7F3K2"` |
| 42 | `normalizeCode("7f3k2")` | `"TQ-7F3K2"` |
| 43 | `normalizeCode("TQ-7F3K")` | `null` |
| 44 | `normalizeCode("hola mundo")` | `null` |
| 45 | `normalizeCode("TQ-2C5PO")` | `"TQ-2C5PO"` (no O to 0 swap) |
| 46 | `canonicalCode("TQ-2C5PO")` | `"TQ-2C5P0"` |
| 47 | `canonicalCode("TQ-9AIM8")` / `canonicalCode("TQ-4K9DL")` | `"TQ-9A1M8"` / `"TQ-4K9D1"` |
| 48 | `matchCode("tq 7f3k2", OPEN)` | `{ kind:"exact", code:"TQ-7F3K2" }` |
| 49 | `matchCode("TQ-2C5PO", OPEN)` | `{ kind:"confusable", code:"TQ-2C5P0" }` |
| 50 | `matchCode("TQ-7F3KZ", OPEN)` | `{ kind:"fuzzy", code:"TQ-7F3K2" }` |
| 51 | `matchCode("TQ-7F3K", OPEN)` | `{ kind:"fuzzy", code:"TQ-7F3K2" }` (one deletion) |
| 52 | `matchCode("TQ-ZZZZZ", OPEN)` | `{ kind:"none" }` |
| 53 | `matchCode("TQ-AAAA3", ["TQ-AAAA1","TQ-AAAA2"])` | `{ kind:"ambiguous", candidates:["TQ-AAAA1","TQ-AAAA2"] }` |
| 54 | `matchCode("TQ-7F3K2", ["TQ-7F3K2","TQ-7F3K3"])` | `{ kind:"exact", code:"TQ-7F3K2" }` (exact beats fuzzy) |
| 55 | `generateCode(() => 0)` | `"TQ-AAAAA"` |
| 56 | `generateCode(() => 0.9999)` | `"TQ-99999"` |
| 57 | 1000 x `generateCode(Math.random)` | all match `HAT_CODE_RE`, none contain I, O, 0, 1 |
| 58 | `foldText("  Doña  ROSA ")` | `"dona rosa"` |
| 59 | `quoteInNote("terminó 3 finos de 18 hileras", SAMPLE_NOTE)` | `true` |
| 60 | `quoteInNote("el tq-7f3k2 ya esta lavado", SAMPLE_NOTE)` | `true` (case and accents) |
| 61 | `quoteInNote("“ya está listo.”", SAMPLE_NOTE)` | `true` (wrapping quotes and trailing dot stripped) |
| 62 | `quoteInNote("terminó 4 finos", SAMPLE_NOTE)` | `false` |
| 63 | `quoteInNote("ok", "ok gracias")` | `false` (under 3 chars) |
| 64 | `matchWeavers("Rosa", W)` / `matchWeavers("Doña Rosa", W)` | `[Rosa Guamán, Rosa Pillco]` (both) |
| 65 | `matchWeavers("rosa pillco", W)` | `[Rosa Pillco]` |
| 66 | `matchWeavers("guaman", W)` | `[Rosa Guamán]` |
| 67 | `matchWeavers("Lucía", W)` / `matchWeavers("Doña", W)` | `[]` / `[]` |
| 68 | `minWeavingDays` for Standard, Fino, Superfino | `2`, `14`, `60` |
| 69 | `detectAnomalies({...base, code:"TQ-4K9D1", grade:"Superfino", rows_per_inch:18, stage:3}, [])` | `[{ kind:"grade_mismatch", message:"18 rows/inch usually means Fino." }]` |
| 70 | Superfino 32, started `2026-09-01`, event to stage 1 at `2026-09-24` | `[{ kind:"too_fast", message:"Woven in 23 days. Superfino usually takes at least 60." }]` |
| 71 | Fino 18, started `2026-09-01`, event to stage 1 at `2026-09-21` (20 days) | `[]` |
| 72 | Standard 10, started `2026-10-01`, event to stage 1 at `2026-10-03` (exactly 2 days) | `[]` |
| 73 | `{...base, weaving_started_at: "2026-10-17T00:00:00Z"}`, no events, `now = 2026-10-18` | `[]` (still weaving, no simulated event) |
| 74 | Same hat with a simulated stage 1 event at `now` | `[{ kind:"too_fast", message:"Woven in 1 days. Standard usually takes at least 2." }]` (see Open question 5 on plural) |
| 75 | `{...base, weaving_started_at:null}` with an event to stage 1 | no `too_fast` |
| 76 | `{...base, weaver_id:null}` | `[{ kind:"weaver_not_found", message:"No weaver is linked to this hat." }]` |
| 77 | `canTransfer(base, member, "seller", "ana@shop.com")` | `{ allowed: true }` |
| 78 | `canTransfer(base, member, "seller", "ana@")` | `code:"invalid_email"`, "Enter a valid email." |
| 79 | `canTransfer({...base, owner_type:"buyer", owner_user_id:"u1"}, member, "buyer", "b@x.com")` | `code:"end_of_chain"` |
| 80 | `canTransfer({...base, workshop_id:"w2"}, member, "seller", "ana@shop.com")` | `code:"not_owner"` |
| 81 | `canClaim({...base, transfer_email:"Ana@Shop.com"}, {...member, email:"ana@shop.com"})` | `{ allowed: true }` |
| 82 | `canClaim({...base, transfer_email:"ana@shop.com"}, member)` | `code:"not_recipient"` |
| 83 | `canClaim(base, member)` | `code:"no_transfer"` |
| 84 | `validateHatFields({ quantity: 0 })` / `({ quantity: 21 })` | `{ quantity: "Quantity must be between 1 and 20." }` |
| 85 | `validateHatFields({ size_cm: 51 })` | `{ size_cm: "Size must be between 52 and 64 cm." }` |
| 86 | `validateHatFields({ price_usd: -1 })` | `{ price_usd: "Price can't be negative." }` |
| 87 | `validateHatFields({ quantity: 3, rows_per_inch: 18, grade: "Fino", straw: "Natural" })` | `{}` |

**Integration (Supabase local, Nice):** updating TQ-2C5P0 from stage 0 to 4 raises `stage_skip`; updating with a stale `version` raises `version_conflict`; `update hat_events` raises "append-only"; inserting Superfino with 18 rows raises `grade_mismatch`; `grade_for_rows(r)` equals `gradeFor(r)` for r in 0..45.

## 11. Acceptance criteria

- [ ] `domain.ts` has zero imports and compiles under both Deno and Node (Vitest).
- [ ] Every function in section 6 exists with the stated signature.
- [ ] All messages match the handoff copy exactly where the handoff defines it.
- [ ] Unit tests 1 to 87 pass; none skipped.
- [ ] `0001_init.sql` contains the constraints, `grade_for_rows`, `hats_guard` and `hat_events_append_only`.
- [ ] Seed loads with the one documented trigger exception for TQ-4K9D1.
- [ ] Agent handlers and `apply-proposals` import these functions; no rule is duplicated inline.
- [ ] No admin bypass anywhere in ownership checks.

## 12. Build plan

This feature's share: **about 15 minutes of the 2 hours** (inside the 0:20 to 0:45 slot, alongside the schema). Write the tests from the table first, then the code, since the table is the contract.

| # | Task | Min |
|---|---|---|
| 1 | Constants, types, stage machine + `canAdvance` | 3 |
| 2 | Grades and field validation | 2 |
| 3 | Codes: normalize, canonical, matchCode (Levenshtein), generate | 3 |
| 4 | Text helpers and `matchWeavers` | 2 |
| 5 | Anomalies | 2 |
| 6 | Paste test table into `it.each`, run until green | 3 |
| 7 | (Nice) `canTransfer`, `canClaim`, SQL integration tests | 5 |

SQL constraints and triggers are written in the schema task (spec 01) but are listed here so they match.

## 13. Interview talking points

- **Rules in code, three layers.** The model never enforces anything. Tool handlers use the rules to explain, `apply-proposals` uses them to decide, and Postgres refuses bad data even if both have a bug.
- **One module, zero imports.** The same function blocks the agent, disables a select in the UI and is tested in Node. No drift between "what the UI says" and "what the server does".
- **Where not to use an LLM.** Grade ranges, stage order and code matching are deterministic, cheap and testable. Asking a model would be slower, cost money and be wrong sometimes.
- **Codes designed for speech.** New codes avoid I, O, 0, 1; matching tolerates the common confusions; ambiguity becomes a question, never a guess.
- **Anomaly thresholds are floors, not averages.** A flag should mean "probably impossible", reviewed by a human, never an automatic block.
- **No admin write bypass.** Admins debug; owners change records. Least privilege applies to people.

## 14. Open questions

1. **Seed vs grade rule:** resolved by D10: the database does not enforce grade vs rows, so TQ-4K9D1 seeds normally and is flagged.
2. **`CODE_ALPHABET` vs seed codes:** 00 says the alphabet has no 0 or 1, but seed codes TQ-2C5P0, TQ-9A1M8 and TQ-4K9D1 contain them. Fine because the regex allows them, but worth stating in 00 that the alphabet applies to generated codes only.
3. **Transfer stage requirement:** should a hat be Finished before a workshop can transfer it to a seller? Not in the handoff; not enforced here.
4. **Rows 6 and 7:** valid input per `ROWS_MIN = 6` but no grade exists for them. Should `ROWS_MIN` be 8 instead?
5. **Message plural:** "Woven in 1 days." Add a tiny plural helper or accept it (rare case).
6. **Thresholds** (2, 14, 60 days) are judgment calls from public descriptions of the trade, not workshop data. Tune with real data.
7. **00 section 2** lists `canAdvance(hat, to, actor)` and `detectAnomalies(hat, events)`. This spec adds an optional `now` to `detectAnomalies` and `weavingDays` for purity, plus helpers (`isOwner`, `canonicalCode`, `matchCode`, `quoteInNote`, `matchWeavers`, `validateHatFields`, `canTransfer`, `canClaim`). Additive only.
8. **Spec numbering:** this spec refers to "spec 01" for the schema and "spec 03" for the agent; `apply-proposals` is assumed to have its own spec.
