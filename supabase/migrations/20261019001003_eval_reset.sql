-- Eval reset (integration notes E2E-1, E2E-3) and an HQ weaver for scripts/verify-security.mjs.
--
-- reset_eval_workshop(): service role only. Puts the Eval Workshop back to its seeded state so
-- `npm run eval` always starts from the same data:
--   - deletes its proposals and agent_runs,
--   - deletes hat_events and hat_flags that are not part of the seed (migrations 4 and 8),
--   - deletes hats an approved create_hat proposal added,
--   - restores the 5 seeded hats (stage, version, grade, rows, straw, size, price, weaver, owner).
-- Moving a stage backwards and deleting hat_events are normally impossible (hats_guard and the
-- append-only trigger). Both triggers get one narrow exception: a transaction-local flag
-- 'toquilla.eval_reset' that only this function sets, and only for Eval Workshop rows. Clients
-- cannot set it (PostgREST exposes no way to run set_config), same pattern as the backfill flag.
-- Other workshops are never touched: every statement filters on the Eval Workshop id.

-- ---------------------------------------------------------------------------
-- hats_guard: same as migration 1 plus the eval reset exception at the top of the UPDATE branch.
-- ---------------------------------------------------------------------------

create or replace function public.hats_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- D15: hats created by app users always start at Weaving, version 1, owned by the workshop.
    -- The service role and migrations (seed history) may insert any valid stage.
    if current_user in ('authenticated', 'anon') then
      if new.stage <> 0 then
        raise exception 'new_hat_must_start_at_weaving' using errcode = 'check_violation';
      end if;
      new.version := 1;
      new.archived := false;
      new.owner_type := 'workshop';
      new.owner_user_id := null;
      new.transfer_email := null;
    end if;
    new.updated_at := coalesce(new.updated_at, now());
    return new;
  end if;

  -- UPDATE. Exception: reset_eval_workshop() restores seeded Eval Workshop hats as they were.
  if current_setting('toquilla.eval_reset', true) = 'on'
     and old.workshop_id = '33333333-3333-4333-8333-333333333333'
     and new.workshop_id = old.workshop_id and new.code = old.code then
    return new;
  end if;

  if old.archived then
    raise exception 'archived' using errcode = 'check_violation';
  end if;
  if new.code <> old.code or new.workshop_id <> old.workshop_id or new.created_at <> old.created_at then
    raise exception 'immutable_column' using errcode = 'check_violation';
  end if;
  if new.stage <> old.stage and new.stage <> old.stage + 1 then
    raise exception 'stage_skip: % to %', old.stage, new.stage using errcode = 'check_violation';
  end if;
  -- Version always moves exactly one step, whatever the writer set. Conflicts are caught by
  -- writers filtering on "version = expected" (optimistic locking).
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- hat_events append-only: same as migration 1 plus the eval reset delete exception.
-- ---------------------------------------------------------------------------

create or replace function public.hat_events_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and current_setting('toquilla.backfill', true) = 'on'
     and old.actor_id is null and new.actor_id is not null
     and new.id = old.id and new.hat_id = old.hat_id and new.type = old.type
     and new.from_stage is not distinct from old.from_stage
     and new.to_stage is not distinct from old.to_stage
     and new.source = old.source
     and new.note is not distinct from old.note
     and new.run_id is not distinct from old.run_id
     and new.created_at = old.created_at then
    return new;
  end if;
  if tg_op = 'DELETE'
     and current_setting('toquilla.eval_reset', true) = 'on'
     and exists (select 1 from hats h
                  where h.id = old.hat_id and h.workshop_id = '33333333-3333-4333-8333-333333333333') then
    return old;
  end if;
  raise exception 'hat_events is append-only' using errcode = 'insufficient_privilege';
end $$;

-- ---------------------------------------------------------------------------
-- reset_eval_workshop()
-- ---------------------------------------------------------------------------

create or replace function public.reset_eval_workshop()
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_ws constant uuid := '33333333-3333-4333-8333-333333333333';
  v_seed_hats constant uuid[] := array[
    'aaaaaaaa-0000-4000-8000-000000000023', 'aaaaaaaa-0000-4000-8000-000000000024',
    'aaaaaaaa-0000-4000-8000-000000000025', 'aaaaaaaa-0000-4000-8000-000000000026',
    'aaaaaaaa-0000-4000-8000-000000000027']::uuid[];
  v_seed_flag constant uuid := 'f0f0f0f0-0000-4000-8000-000000000004';
  n_props int; n_events int; n_flags int; n_hats int; n_runs int; n_restored int;
begin
  perform set_config('toquilla.eval_reset', 'on', true);

  delete from proposals where workshop_id = v_ws;
  get diagnostics n_props = row_count;

  -- Seeded events: ids ...074 to ...087 (migration 4) and the flag review from migration 8.
  delete from hat_events e
   using hats h
   where h.id = e.hat_id and h.workshop_id = v_ws
     and not (e.id between 'eeeeeeee-0000-4000-8000-000000000074' and 'eeeeeeee-0000-4000-8000-000000000087')
     and not (e.type = 'flag_reviewed' and e.note = 'Reviewed for the eval set.');
  get diagnostics n_events = row_count;

  delete from hat_flags f
   using hats h
   where h.id = f.hat_id and h.workshop_id = v_ws and f.id <> v_seed_flag;
  get diagnostics n_flags = row_count;

  -- The seeded flag stays reviewed (migration 8), so the canonical eval can raise it again.
  update hat_flags
     set reviewed_at = coalesce(reviewed_at, now()),
         review_reason = 'Reviewed for the eval set: the canonical note raises this flag again.'
   where id = v_seed_flag;

  delete from hats where workshop_id = v_ws and not (id = any (v_seed_hats));
  get diagnostics n_hats = row_count;

  delete from agent_runs where workshop_id = v_ws;
  get diagnostics n_runs = row_count;

  update hats h
     set weaver_id = s.weaver_id, grade = s.grade, rows_per_inch = s.rows_per_inch, straw = s.straw,
         size_cm = s.size_cm, price_usd = s.price_usd, stage = s.stage, version = s.version,
         archived = false, owner_type = 'workshop', owner_user_id = null, transfer_email = null,
         updated_at = s.updated_at
    from (values
      ('aaaaaaaa-0000-4000-8000-000000000023'::uuid, 'bbbbbbbb-0000-4000-8000-000000000011'::uuid, 'Fino', 18, 'Natural', 57, 95::numeric, 1::smallint, 2, '2026-10-14 15:11:00+00'::timestamptz),
      ('aaaaaaaa-0000-4000-8000-000000000024', 'bbbbbbbb-0000-4000-8000-000000000013', 'Superfino', 32, 'Natural', 58, 350, 4, 5, '2026-10-02 17:00:00+00'),
      ('aaaaaaaa-0000-4000-8000-000000000025', 'bbbbbbbb-0000-4000-8000-000000000012', 'Standard', 10, 'Natural', 57, 45, 0, 1, '2026-10-06 15:00:00+00'),
      ('aaaaaaaa-0000-4000-8000-000000000026', 'bbbbbbbb-0000-4000-8000-000000000014', 'Superfino', 18, 'Bleached', 58, 280, 3, 4, '2026-10-12 14:04:00+00'),
      ('aaaaaaaa-0000-4000-8000-000000000027', 'bbbbbbbb-0000-4000-8000-000000000014', 'Fino', 20, 'Natural', 58, 120, 1, 2, '2026-10-16 15:00:00+00')
    ) as s(id, weaver_id, grade, rows_per_inch, straw, size_cm, price_usd, stage, version, updated_at)
   where h.id = s.id and h.workshop_id = v_ws;
  get diagnostics n_restored = row_count;

  perform set_config('toquilla.eval_reset', 'off', true);
  return jsonb_build_object('proposals', n_props, 'agent_runs', n_runs, 'hat_events', n_events,
                            'hat_flags', n_flags, 'extra_hats', n_hats, 'hats_restored', n_restored);
end $$;

revoke all on function public.reset_eval_workshop() from public, anon, authenticated;
grant execute on function public.reset_eval_workshop() to service_role;

-- ---------------------------------------------------------------------------
-- HQ test weaver: scripts/verify-security.mjs creates a throwaway hat in Toquilla Trace HQ
-- (as admin, through create_hat) to exercise transfer and claim without touching demo data.
-- ---------------------------------------------------------------------------

insert into public.weavers (id, workshop_id, name, village, province, specialty, weaving_since, bio, show_name, created_at)
values ('bbbbbbbb-0000-4000-8000-000000000021', '22222222-2222-4222-8222-222222222222', 'HQ Test Weaver',
        'Cuenca', 'Azuay', array['Fino']::text[], null,
        'Used by the security checks for throwaway hats. Not a real weaver.', true, '2026-10-18 20:00:00+00')
on conflict (id) do nothing;
