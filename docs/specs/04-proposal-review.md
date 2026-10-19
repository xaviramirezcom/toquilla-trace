# 04. Proposal review and apply-proposals

## 1. Summary

The review panel on `/workshop` shows each AI proposal as a card the person can approve, edit, answer, fix or reject. Approved decisions go to the `apply-proposals` Edge Function, which re-checks every rule in code and writes hats, history and flags in one database transaction.

Serves: real application logic, AI proposes and humans approve, rules in code, least privilege, logs, product taste (honest states, undo), code the candidate can explain.

## 2. Scope

| Item | Must/Nice/Cut | Why |
|---|---|---|
| Load open proposals on `/workshop`, merge new ones on top | Must | Panel survives reload |
| Card anatomy (type, "Proposed by AI", confidence, summary, chips, mini stepper) | Must | Transparency principle |
| States: pending, approving, approved, rejected, blocked, question, failed | Must | Core loop |
| Why? with the quote | Must | Every proposal traces to something said |
| Approve (optimistic, revert to failed) and Reject | Must | Core loop |
| Approve all valid / Reject all | Must | One tap for a clean note |
| Answer a question (weaver choice chips) | Must | Sample note needs it (2 Rosas) |
| Blocked: Dismiss | Must | It is a reject |
| Blocked: "Change to Washing" fix | Nice | One edit, cheap but optional |
| `apply-proposals` with `domain.ts` re-check, optimistic locking, idempotency, one transaction per proposal | Must | The security boundary |
| Failed card: "Refresh and retry", Reference (member) / View log (admin) | Must | Debuggable failures |
| Completion card + "n changes saved." toast | Must | Closure |
| Mobile docked approve bar with mic | Must | Thumb reach, record again without clearing |
| Editing state (create_hat, advance_stage, flag_issue forms) | Nice | Conventions mark edit as Nice |
| Undo within 10 s (delayed commit) | Nice | Conventions mark undo as Nice |
| Restore a rejected card | Nice | Needs a small RPC |
| Keyboard A / E / R on focused card | Nice | Desktop only |
| "Someone else..." opens Add weaver | Nice | Depends on Weavers dialog; fallback opens edit |
| Stage-forward trigger on `hats` (defense in depth) | Nice | Rules already in TS and in the SQL `where` |
| Transfer proposals | Cut | Not a tool type in conventions |

## 3. User stories

**Workshop member**
- I see each proposed change with the words I said, so I trust or correct it.
- I approve the valid ones in one tap and answer "which Rosa?" with one chip.
- When the rules block a change, I see why and fix it to the next allowed stage.
- If I approve by mistake, I undo within 10 seconds and nothing was written.
- If a save fails, I retry, or copy a reference for support.
- On my phone, I approve from a bottom bar and can record another update without losing the queue.

**Admin**
- On a failed approval I click View log and land on the rows for that request.
- In the run trace I can see what was edited (original payload vs edits).

## 4. UI

**Route:** `/workshop`, main column under the composer and run bubbles.

**Components**

| Component | File | Job |
|---|---|---|
| `ProposalPanel` | `components/workshop/ProposalPanel.tsx` | Header, legend, list, completion card, empty state |
| `ProposalCard` | `components/workshop/ProposalCard.tsx` | One card, all states |
| `ProposalEditForm` | `components/workshop/ProposalEditForm.tsx` | Per-type form (Nice) |
| `MobileApproveBar` | `components/workshop/MobileApproveBar.tsx` | Docked bar: mic, Reject all, Approve all valid |
| `useProposals` | `components/workshop/useProposals.ts` | List state, decision queue, calls `apply-proposals` |
| `cardView(p)` | `lib/proposals/view.ts` | Pure: proposal -> summary, chips, border, tag (tested) |

**Card anatomy** (radius 14, padding 16; handoff "Proposal review panel > Card anatomy"):
- Top row: type badge (Create hat / Advance stage / Flag issue), "✦ Proposed by AI", confidence chip ("High confidence" green / "Check this" amber), "Edited by you" or "Fixed by you" tag, status tag on the right.
- Summary 15/600. Examples: "Create 3 hats · Fino · 18 rows/inch · Weaver: 2 matches for “Rosa”", "Advance TQ-7F3K2 to Bleaching", "Move TQ-2C5P0 to Finished" (blocked), "Flag TQ-4K9D1 · Grade is Superfino but rows per inch is 18 (Fino range)."
- Field chips: create `Qty · Grade · Rows/inch · Weaver`; advance `Hat · Owner`; flag `Hat · Claimed · Measured · Fino range`.
- Mini stepper `Weaving ● -> ○ Washing` (advance only; the target dot is `--err` when blocked).
- Why? toggle (`aria-expanded`) shows `why` and the quote in quotation marks.
- Actions: Reject (text), Edit (secondary), Approve (primary, 132 px). Right side on desktop, full-width row on mobile.

**States** (border styles from handoff "AI visual language")

| # | State | Look | Content / actions |
|---|---|---|---|
| 1 | pending | 1.5 px dashed `--accent` on `--accent-tint` | Reject, Edit, Approve |
| 2 | editing (client only) | dashed accent on `--surface` | Form, Save changes / Cancel |
| 3 | approving (client only) | as pending | Approve keeps width, spinner, "Approving...", disabled |
| 4 | approved | solid `--ok` on `--ok-tint`, check icon | "Approved by you · just now", Undo link while the 10 s window is open |
| 5 | rejected / dismissed | one muted line, summary struck through | "Rejected · Restore" or "Dismissed · Restore" |
| 6 | blocked | solid `--err` on `--err-tint`, lock icon, no Approve | `rule_result.message`, e.g. "Can't move TQ-2C5P0 from Weaving to Finished. Next allowed stage: Washing." Buttons "Change to Washing", Dismiss |
| 7 | question | solid `--warn` on `--warn-tint`, help icon | "I found 2 weavers named Rosa. Which one?", chips "Rosa Pillco (Sígsig)", "Rosa Guamán (Cuenca)", "Someone else...". Approve disabled, Reject and Edit available |
| 8 | failed | solid `--err` on `--surface` | "Couldn't save this change. Someone may have updated this hat." Refresh and retry; member "Reference: req_8f2a" + copy; admin View log |

Every state has an icon and a text label (never colour alone).

**Panel header:** "Review proposals (n)" (n = cards shown), Reject all (text, disabled when none open), "Approve all valid (k)" (primary, k = pending cards, disabled at 0). Legend: dashed = Proposed by AI, solid green = Approved, red = Blocked by rules. Desktop hint "Focus a card, then A E R".

**Empty:** "No proposals yet. Hold the mic and tell me what happened, and I'll prepare changes for you to approve."

**Loading:** 2 skeleton cards while open proposals load.

**Load error:** inline card "Couldn't load proposals." with Try again (new copy, see Open questions); logs `ui.error`.

**Completion card** (all cards approved, rejected or dismissed, none in flight or in an undo window): "All done. {a} approved, {r} rejected." (r counts rejected + dismissed), **View updated hats** (`/hats`), **Write another note** (clears resolved cards, focuses composer). Toast "{a} changes saved." ("1 change saved.") fires when the last commit succeeds and a > 0.

**Mobile:** cards stack full width; the approve bar docks above the tab bar (48 px controls): mic (accent tint, aria-label "Record another update"), Reject all, Approve all valid (fills). Shown while any card is open and the composer is not active. Tapping the mic swaps the bar for the voice dock (spec 02) in recording state.

**Merging new proposals:** when a new run returns, its cards go on top. Earlier cards that are open, in an undo window, or in flight stay below; resolved ones are dropped. If any earlier open card remains, toast "New proposals added. Earlier ones are still waiting below."

**Role differences**

| | Member | Admin |
|---|---|---|
| Failed card | "Reference: req_8f2a" (first 8 chars shown, full id copied), toast "Reference copied. Share it with support." | **View log** -> `/logs?request_id={id}` |
| Approve rights | Own workshop proposals | Same (own workshop only; admins read others but don't decide for them) |

## 5. Data

Uses `proposals`, `hats`, `hat_events`, `hat_flags`, `weavers`, `profiles`, `app_logs` as named in conventions.

**Payload shapes** (written by `workshop-agent`, spec 03 must match):

```ts
type CreateHatPayload = {
  quantity: number;                 // 1..20
  grade: "Standard" | "Fino" | "Superfino";
  rows_per_inch: number;            // 6..40
  weaver_id: string | null;         // null when ambiguous
  weaver_candidates?: { id: string; name: string; village: string }[];
  straw?: "Natural" | "Bleached" | "Dyed";
};
type AdvanceStagePayload = {
  hat_id: string; hat_code: string;
  from_stage: number; to_stage: number;   // 0..4
  expected_version: number;               // hats.version when proposed
};
type FlagIssuePayload = {
  hat_id: string; hat_code: string;
  kind: "grade_mismatch" | "too_fast" | "weaver_not_found" | "other";
  message: string;                        // 1..200
};
```

**Editable fields (whitelist, also used by the server):**

| Type | Keys allowed in `edits` |
|---|---|
| `create_hat` | `quantity`, `grade`, `rows_per_inch`, `weaver_id` |
| `advance_stage` | `to_stage`, `expected_version` (set by Refresh and retry) |
| `flag_issue` | `message` |

**Migration `0002_proposal_review.sql`:**

```sql
-- Keep the AI's original payload; store human edits next to it (run trace diff).
alter table proposals add column if not exists edits jsonb;

-- Clients read proposals, they never write them directly.
alter table proposals enable row level security;
drop policy if exists proposals_select on proposals;
create policy proposals_select on proposals for select to authenticated
  using (
    workshop_id = (select workshop_id from profiles where id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
-- No insert/update/delete policies for authenticated: writes go through
-- apply-proposals (service role) or restore_proposal() below.

create or replace function apply_proposal(
  p_proposal_id uuid, p_actor uuid, p_payload jsonb,
  p_edits jsonb, p_codes text[]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_prop  proposals%rowtype;
  v_hat   hats%rowtype;
  v_codes text[] := '{}';
  v_flag  uuid;
  i int;
begin
  select * into v_prop from proposals where id = p_proposal_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_prop.status = 'approved' then
    return jsonb_build_object('status','approved','idempotent',true,
      'hat_codes', coalesce(v_prop.rule_result->'hat_codes','[]'::jsonb));
  end if;
  if v_prop.status in ('rejected','dismissed') then raise exception 'not_open'; end if;

  if v_prop.type = 'create_hat' then
    for i in 1 .. (p_payload->>'quantity')::int loop
      insert into hats (code, workshop_id, weaver_id, grade, rows_per_inch, straw,
                        stage, owner_type, version, weaving_started_at)
      values (p_codes[i], v_prop.workshop_id, (p_payload->>'weaver_id')::uuid,
              p_payload->>'grade', (p_payload->>'rows_per_inch')::int,
              coalesce(p_payload->>'straw','Natural'), 0, 'workshop', 1, now())
      returning * into v_hat;
      insert into hat_events (hat_id, type, from_stage, to_stage, actor_id, source, note, run_id)
      values (v_hat.id, 'created', null, 0, p_actor, 'ai_proposal', v_prop.quote, v_prop.run_id);
      v_codes := v_codes || v_hat.code;
    end loop;

  elsif v_prop.type = 'advance_stage' then
    update hats
       set stage = (p_payload->>'to_stage')::smallint,
           version = version + 1, updated_at = now()
     where id = (p_payload->>'hat_id')::uuid
       and workshop_id = v_prop.workshop_id
       and version = (p_payload->>'expected_version')::int
       and (p_payload->>'to_stage')::int = stage + 1        -- forward one step only
    returning * into v_hat;
    if not found then raise exception 'version_conflict'; end if;
    insert into hat_events (hat_id, type, from_stage, to_stage, actor_id, source, note, run_id)
    values (v_hat.id, 'stage_advanced', v_hat.stage - 1, v_hat.stage, p_actor,
            'ai_proposal', v_prop.quote, v_prop.run_id);
    v_codes := array[v_hat.code];

  elsif v_prop.type = 'flag_issue' then
    insert into hat_flags (hat_id, kind, message, raised_by)
    values ((p_payload->>'hat_id')::uuid, p_payload->>'kind', p_payload->>'message', 'assistant')
    returning id into v_flag;
    insert into hat_events (hat_id, type, actor_id, source, note, run_id)
    values ((p_payload->>'hat_id')::uuid, 'flag_raised', p_actor, 'ai_proposal', v_prop.quote, v_prop.run_id);
    v_codes := array[p_payload->>'hat_code'];
  end if;

  update proposals
     set status = 'approved', edits = p_edits, edited = (p_edits is not null and p_edits <> '{}'::jsonb),
         decided_by = p_actor, decided_at = now(),
         rule_result = jsonb_build_object('ok', true, 'hat_codes', to_jsonb(v_codes), 'flag_id', v_flag)
   where id = p_proposal_id;

  return jsonb_build_object('status','approved','hat_codes', to_jsonb(v_codes));
end $$;

revoke all on function apply_proposal(uuid, uuid, jsonb, jsonb, text[]) from public, anon, authenticated;
grant execute on function apply_proposal(uuid, uuid, jsonb, jsonb, text[]) to service_role;

-- Nice: Restore a rejected/dismissed card to the state it had before.
create or replace function restore_proposal(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('pending','question','blocked') then raise exception 'bad_status'; end if;
  update proposals set status = p_status, decided_by = null, decided_at = null
   where id = p_id
     and status in ('rejected','dismissed')
     and workshop_id = (select workshop_id from profiles where id = auth.uid());
  if not found then raise exception 'not_found'; end if;
end $$;
revoke all on function restore_proposal(uuid, text) from public, anon;
grant execute on function restore_proposal(uuid, text) to authenticated;
```

A plpgsql function body runs in one transaction: any `raise` rolls back every insert and update in it. One call per proposal, so one bad proposal never undoes the others.

## 6. Server logic and API

**Contract** (conventions section 4): `POST apply-proposals`, header `x-request-id`, body `{ decisions: [{ proposal_id, action: "approve" | "reject", edits? }] }`, response `{ results: [{ proposal_id, status, error? }] }`.

`status` in results: `approved | rejected | dismissed | blocked | failed`. `error`: `{ code, message }`.

| HTTP | When |
|---|---|
| 200 | Body valid (per-item problems are in `results`) |
| 400 `invalid_request` | Not 1..50 decisions, duplicate ids, bad action |
| 401 `unauthorized` | No or invalid JWT |
| 500 `internal` | Unexpected top-level failure |

**Algorithm**

1. Handle CORS. Read `x-request-id` (or generate one). Start timer.
2. `getUser(jwt)`; load profile `{ id, workshop_id, role }`. 401 if missing.
3. Validate body shape. 400 on failure.
4. Load all proposals by id with the service client. Missing, or `workshop_id !== profile.workshop_id`, -> result `failed` with `not_found` (no leak of other workshops).
5. For each decision, in order, inside its own try/catch:
   - **reject:** status `approved` -> `failed` `already_approved`. Status `rejected`/`dismissed` -> return it (idempotent). Else update `status = blocked ? 'dismissed' : 'rejected'`, `decided_by`, `decided_at`. Log `proposal.reject`.
   - **approve:**
     1. Status `approved` -> return `approved` (idempotent, no writes). `rejected`/`dismissed` -> `failed` `not_open`.
     2. `const m = mergeEdits(p.type, p.payload, d.edits)`; on error -> `failed` `invalid_edits`.
     3. Load context fresh: the hat (advance, flag) and the weaver (create).
     4. `const r = validateApproval(p.type, m, ctx, actor)` from `domain.ts`. Log `agent.rule.check`.
     5. `r.ok === false` and `r.kind === "conflict"` -> set status `failed`, log `proposal.apply_failed`, return `failed` `version_conflict`.
     6. `r.ok === false` and `r.kind === "rule"` -> set status `blocked`, `rule_result = r`, log `proposal.apply_failed` (`rule_blocked`), return `blocked` with `r.message`.
     7. Create: `codes = Array.from({length: m.quantity}, () => generateCode(rand))`.
     8. `rpc("apply_proposal", {...})`. On unique violation (`23505`) regenerate codes and retry once. On `version_conflict` -> as step 5.
     9. Log `hat.create` or `hat.stage.advance` (none extra for flags), then `proposal.approve`. Return `approved`.
6. Return 200 `{ results }`. Unexpected per-item errors -> `failed` `internal` + `proposal.apply_failed` level error.

**Pure helpers in `domain.ts`** (no imports, unit tested):

```ts
export type RuleResult =
  | { ok: true }
  | { ok: false; kind: "rule" | "conflict"; code: string; message: string; next_stage?: number };

export function mergeEdits(type: ProposalType, payload: any, edits?: Record<string, unknown>) {
  const allowed = EDITABLE[type];                       // whitelist table above
  for (const k of Object.keys(edits ?? {}))
    if (!allowed.includes(k)) throw new Error(`invalid_edits:${k}`);
  return { ...payload, ...edits };
}

export function validateApproval(type, m, ctx, actor): RuleResult {
  if (type === "create_hat") {
    if (!(m.quantity >= 1 && m.quantity <= 20)) return rule("quantity_range", "Quantity must be 1 to 20.");
    if (!(m.rows_per_inch >= ROWS_MIN && m.rows_per_inch <= ROWS_MAX)) return rule("rows_range", "Rows per inch must be 6 to 40.");
    if (gradeMismatch(m.grade, m.rows_per_inch))
      return rule("grade_mismatch", `${m.rows_per_inch} rows/inch usually means ${gradeFor(m.rows_per_inch)}.`);
    if (!m.weaver_id || !ctx.weaver) return rule("weaver_required", "Pick a weaver for these hats.");
    return { ok: true };
  }
  const hat = ctx.hat;
  if (!hat || hat.archived) return rule("hat_unavailable", `${m.hat_code} isn't an open hat in your workshop.`);
  if (type === "flag_issue")
    return m.message?.trim() && m.message.length <= 200 ? { ok: true } : rule("message_required", "Add a short message.");
  // advance_stage
  if (hat.version !== m.expected_version)
    return { ok: false, kind: "conflict", code: "version_conflict", message: "Couldn't save this change. Someone may have updated this hat." };
  if (!canAdvance(hat, m.to_stage, actor)) {
    if (hat.owner_type !== "workshop") return rule("not_owner", "Only the current owner can change the stage.");
    if (hat.stage === 4) return rule("finished", "This hat is finished.");
    return { ok: false, kind: "rule", code: "stage_skip", next_stage: hat.stage + 1,
      message: `Can't move ${hat.code} from ${STAGES[hat.stage]} to ${STAGES[m.to_stage]}. Next allowed stage: ${STAGES[hat.stage + 1]}.` };
  }
  return { ok: true };
}
```

**Undo: delayed commit on the client (decision)**

| Option | Verdict |
|---|---|
| Commit now, undo with a compensating event | Rejected. Undoing an advance means moving a stage backward, which the domain forbids, and undoing a create means deleting from append-only history |
| Server-side pending commit with a scheduler | Rejected. Needs a cron or queue, too much for 2 hours |
| **Client holds the decision 10 s, then sends it** | **Chosen.** Undo cancels a timer, so the database never sees the mistake and history stays truly append-only |

How it works (`useProposals`):
- Approve: card -> `approved` with Undo; push `{ proposal_id, edits, dueAt: now + 10s }` into a queue ref; undo toast "Approved: TQ-7F3K2 -> Bleaching" (10 s, countdown bar).
- Approve all valid: all pending cards approved together, one entry each, one toast "Approved {k} proposals." whose Undo cancels them all.
- Every second, entries past `dueAt` are sent in **one** `apply-proposals` call.
- Undo: remove entries, card back to its previous state, log `proposal.undo`.
- Flush early (no waiting) on `visibilitychange` to hidden and `pagehide` (`fetch` with `keepalive: true`), before logout, and before "Discard and edit".
- Results map back to cards: `approved` stays; `blocked` -> blocked card with message; `failed` -> failed card with the call's request id.
- Server idempotency makes a double flush (timer + pagehide) safe.
- "Refresh and retry" and answering after a failure send immediately (state `approving`), no undo window.
- Without the Nice undo, the same `commit()` runs immediately with the `approving` spinner.

Reject is sent immediately (it writes no hat data). Restore calls `restore_proposal(id, previousStatus)` (Nice).

**Client actions -> requests**

| UI action | Request |
|---|---|
| Approve / Approve all valid | queued `approve` with `edits` from the card draft |
| Choose a weaver chip | local: `draft.weaver_id = id`, status `pending`, conf high; log `proposal.edit` |
| "Change to Washing" | local: `draft.to_stage = next_stage`, status `pending`, tag "Fixed by you"; log `proposal.edit` |
| Save changes (edit form) | local only; log `proposal.edit` |
| Reject / Dismiss / Reject all | immediate `reject` (one call for Reject all) |
| Refresh and retry | re-read hat via Supabase (`select stage, version from hats where id`), set `draft.expected_version`, immediate `approve` |

**Loading open proposals:** `select * from proposals where status in ('pending','question','blocked','failed') order by created_at desc` (RLS limits to the workshop). Join the hat code and current stage for display.

## 7. Business rules and edge cases

1. Nothing writes to `hats`, `hat_events` or `hat_flags` except `apply_proposal()`, called only by the service role.
2. Every approve re-runs `validateApproval` on fresh data, even if the card looked valid.
3. An advance succeeds only if `hats.version` equals `expected_version` and `to_stage = stage + 1`, checked in TS and again in the SQL `where`.
4. Approving an already approved proposal returns `approved` and writes nothing (no duplicate hats).
5. Approving a rejected or dismissed proposal returns `failed` `not_open`.
6. Rejecting a `blocked` proposal stores `dismissed`; any other open status stores `rejected`.
7. A decision for a proposal of another workshop returns `not_found`, also for admins.
8. Unknown keys in `edits` (for example `workshop_id`, `stage`, `owner_type`) return `invalid_edits` and write nothing.
9. Creating hats with a grade that does not match the rows (Fino at 30) is `blocked` with "30 rows/inch usually means Superfino."
10. A create proposal without a weaver cannot be approved (Approve disabled on `question`; server returns `weaver_required`).
11. Create with quantity n inserts exactly n hats and n `created` events, or none.
12. Approve all valid only includes `pending` cards (never question, blocked, editing, failed).
13. Undo within 10 s sends nothing to the server; after 10 s the Undo link disappears.
14. Hiding the tab during an undo window sends the queued decisions right away.
15. A failed card's Refresh and retry uses the current hat version; if the stage moved on, the result is `blocked` with the next allowed stage.
16. Archived hats can't be advanced or flagged (`hat_unavailable`).
17. In the edit form, the stage select enables only the next stage; Save is disabled while rows are outside 6 to 40 or the grade mismatches (with "Use {grade}" fix).
18. New proposals from another run appear above earlier open ones; earlier ones keep their state.
19. The completion card shows only when no card is open, in flight, or in an undo window.

## 8. Logging

Server rows: `source: "edge:apply-proposals"`, `request_id` from the header, `user_id`, `workshop_id`, `run_id` from the proposal, `hat_code` when one hat is involved.

| Action | Level | Payload |
|---|---|---|
| `agent.rule.check` | info / warn | `{ phase: "apply", proposal_id, type, ok, code?, next_stage? }` |
| `proposal.approve` | info | `{ proposal_id, type, edited, edits, hat_codes, flag_id?, idempotent }` |
| `proposal.reject` | info | `{ proposal_id, type, status: "rejected" \| "dismissed" }` |
| `proposal.apply_failed` | warn (rule, conflict) / error (internal) | `{ proposal_id, type, code, expected_version?, actual_version? }` + `error` column on internal |
| `hat.create` | info | `{ proposal_id, codes, grade, rows_per_inch, weaver_id }` |
| `hat.stage.advance` | info | `{ proposal_id, from, to, version }` |

Client rows (`source: "web"`), only for actions that never reach the server:

| Action | Payload |
|---|---|
| `proposal.edit` | `{ proposal_id, type, via: "form" \| "answer" \| "fix", fields: string[] }` |
| `proposal.undo` | `{ proposal_ids, kind: "undo" \| "restore" }` |
| `ui.error` | `{ where: "proposals.load" \| "proposals.commit", code }` |

`duration_ms` is set on `proposal.approve` and `proposal.apply_failed`.

## 9. Security and privacy

- The function verifies the JWT and derives `workshop_id` from `profiles`, never from the body.
- Least privilege: clients can only `select` proposals. `apply_proposal()` is executable only by `service_role`. `restore_proposal()` checks workshop membership and can't set `approved`.
- Edits are whitelisted per type, so a client can't change ownership, workshop or stage directly.
- The AI's output is untrusted: payloads are re-validated with `domain.ts`; the model's claimed `from_stage` is ignored for rules (the hat row is the truth).
- Members see a reference id only (no data). View log is admin only, and `/logs` is protected by RLS.
- Logs hold quotes from notes; `app_logs` is admin-read only.

## 10. Tests

Vitest, `tests/domain/apply.test.ts` (pure):

| Input | Expected |
|---|---|
| advance, hat `{stage:1, version:3, owner_type:"workshop"}`, `{to_stage:2, expected_version:3}` | `{ ok: true }` |
| advance, hat `{code:"TQ-2C5P0", stage:0, version:1}`, `{to_stage:4, expected_version:1}` | `stage_skip`, `next_stage:1`, message "Can't move TQ-2C5P0 from Weaving to Finished. Next allowed stage: Washing." |
| advance, hat version 4, `expected_version:3` | `kind:"conflict"`, `version_conflict` |
| advance, hat `owner_type:"seller"` | `not_owner` |
| advance, hat `stage:4` | `finished` |
| advance, hat `archived:true` | `hat_unavailable` |
| create `{quantity:3, grade:"Fino", rows_per_inch:18, weaver_id:"w1"}`, weaver found | `{ ok: true }` |
| create same with `weaver_id:null` | `weaver_required` |
| create `{grade:"Fino", rows_per_inch:30}` | `grade_mismatch`, "30 rows/inch usually means Superfino." |
| create `quantity:21` | `quantity_range` |
| flag `message:""` | `message_required` |
| `mergeEdits("advance_stage", p, {stage: 4})` | throws `invalid_edits:stage` |
| `mergeEdits("create_hat", p, {weaver_id:"w2"})` | payload with `weaver_id:"w2"` |

`tests/proposals/view.test.ts`: `cardView` for blocked advance returns border `solid`, tag "Blocked by rules", no Approve; for question returns `canApprove:false`; completion text for 3 approved + 1 dismissed is "3 approved, 1 rejected."

`tests/proposals/queue.test.ts` (fake timers): approve then undo at 9 s -> no commit call; approve, advance 10 s -> one call with one decision; approve 3, advance 10 s -> one call with 3 decisions; `visibilitychange` hidden at 2 s -> immediate call.

**Integration (against the deployed Supabase, seed data):**
- Approve "Advance TQ-7F3K2 to Bleaching": hat stage 2, version +1, one `stage_advanced` event, `proposal.approve` and `hat.stage.advance` logs with the same request id.
- Send the same approve twice: second result `approved`, still one event.
- Two proposals for TQ-8B2N4 Washing -> Bleaching with the same `expected_version`: first `approved`, second `failed` `version_conflict`.
- Member token calling `rpc('apply_proposal')` directly: permission denied.
- Member token `update proposals set status='approved'`: 0 rows (no policy).

## 11. Acceptance criteria

- [ ] After sending the sample note, 4 cards appear: create (needs your answer), advance TQ-7F3K2 (pending), move TQ-2C5P0 to Finished (blocked), flag TQ-4K9D1 (pending).
- [ ] Each card's Why? shows the quoted words from the note.
- [ ] Tapping "Rosa Pillco (Sígsig)" turns the create card pending; approving it creates 3 Fino hats visible in Hats.
- [ ] Approving TQ-7F3K2 shows Approved with Undo; after 10 s the hat is at Bleaching on its detail page.
- [ ] Undo within 10 s returns the card to pending and the hat stays at Washing (Nice).
- [ ] The blocked card shows "Can't move TQ-2C5P0 from Weaving to Finished. Next allowed stage: Washing." and has no Approve button.
- [ ] "Change to Washing" makes it pending with "Fixed by you" (Nice); Dismiss collapses it to "Dismissed".
- [ ] "Approve all valid (n)" approves only pending cards.
- [ ] Reject all collapses every open card to "Rejected".
- [ ] When all cards are resolved, "All done. 3 approved, 1 rejected." shows and the toast "3 changes saved." appears after saving.
- [ ] Forcing a conflict (advance the hat in another tab first) shows the failed card; a member sees "Reference: req_...", an admin sees View log that opens filtered Logs.
- [ ] On a 390 px screen, the approve bar is docked at the bottom and its mic opens the voice dock without clearing cards; new cards appear on top with the toast.
- [ ] Reloading `/workshop` shows the still-open proposals.
- [ ] Logs show `agent.rule.check`, `proposal.approve` and `hat.stage.advance` rows sharing one request id.

## 12. Build plan

Share of the 2 hours: **30 minutes** for the Must items (inside "0:45 to 1:15" with spec 02 and the agent).

| # | Task | Min |
|---|---|---|
| 1 | `mergeEdits` + `validateApproval` in `domain.ts` + tests | 6 |
| 2 | Migration: `edits` column, select policy, `apply_proposal()` | 5 |
| 3 | `apply-proposals` function (auth, loop, rules, RPC, logs) | 8 |
| 4 | `ProposalCard` + `cardView` (pending, approving, approved, rejected, blocked, question, failed) | 6 |
| 5 | `useProposals`: load, merge, approve/reject/approve all/reject all, answer chips, failed retry, completion card | 4 |
| 6 | Mobile approve bar with mic | 1 |
| | **Total Must** | **30** |
| N1 | Undo queue (delayed commit, flush on hide) + tests | 6 |
| N2 | Edit form for 3 types + "Change to Washing" | 8 |
| N3 | `restore_proposal()` + Restore link, keyboard A/E/R | 4 |

## 13. Interview talking points

- **Rules run twice, on purpose:** the agent's tools check rules to explain blocks early; `apply-proposals` re-checks on fresh data because time passed and the AI output is untrusted. The SQL `where` is the last line (version and one-step forward).
- **Optimistic locking:** `hats.version` catches two people (or two proposals) racing on the same hat. The loser gets an honest "Someone may have updated this hat" and a retry with the fresh version.
- **One transaction per proposal:** a plpgsql function is atomic, so 3 hats + 3 events land together or not at all, and one bad card doesn't roll back the others.
- **Idempotency:** the proposal row is locked `for update` and `approved` returns early, so double clicks, retries and the undo flush can't create duplicate hats.
- **Undo as delayed commit:** history is append-only and stages only move forward, so a compensating "undo" would break our own rules. Holding the decision 10 s is simpler and correct; the trade-off (a killed tab may lose a decision) is mitigated with a keepalive flush.
- **Least privilege:** clients can't write proposals or hats on these paths; edits are whitelisted.
- **Extending in 45 minutes:** add Transfer proposals with the same pattern; batch approvals into one transaction per run if workshops want all-or-nothing; push open-proposal counts with Supabase Realtime; a stage-forward trigger on `hats` so even manual writes can't skip.

## 14. Open questions

1. **Restore** has no action in the `apply-proposals` contract. This spec adds `restore_proposal(id, status)` as an RPC instead of changing the contract.
2. **Dismiss** is sent as `reject`; the server stores `dismissed` when the proposal was `blocked`. Fine, or add an explicit action?
3. **New column `proposals.edits`** keeps the AI payload untouched for the run trace diff. Conventions don't list it.
4. **Payload shapes** in section 5 must match spec 03 (`expected_version`, `weaver_candidates`, `kind`).
5. **Proposals RLS** here is select-only for clients, tighter than "members read and write rows of their own workshop". Recommend the same for `hats`/`hat_events` writes that should only come from functions.
6. **`hat_events.type` values** are not enumerated in conventions. This spec uses `created`, `stage_advanced`, `flag_raised`.
7. **Log actions:** no action exists for a raised flag (logged inside `proposal.approve` as `flag_id`) or for restore (logged as `proposal.undo` with `kind:"restore"`).
8. **Start stage for new hats:** "terminó 3 finos" means weaving is done, but created hats start at Weaving (stage 0), like manual create. Should the agent propose creation at Washing?
9. **Admins deciding for other workshops** is not allowed here. Confirm.
10. **Handoff "Transfer" type badge** exists, but there is no transfer proposal type. Cut.
11. **Undo trade-off:** a decision lives only in the browser for up to 10 s. If the tab is killed without `pagehide`, the card is pending again on reload.
12. **Load error copy** "Couldn't load proposals." is new (not in the handoff).
13. **Stage-forward trigger** (Nice) may belong in the schema spec (01) rather than here.
