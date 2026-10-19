-- Security fix (docs/SECURITY.md section 11, gap 2): members could write hats and hat_events
-- directly with their table grants, skipping the audited RPCs (an event with any type or a
-- backdated created_at, a stage move or a transfer with no event row).
--
-- After this migration:
-- 1. Members have no INSERT on hats or hat_events, no UPDATE of stage, archived, owner_type,
--    transfer_email (version was never granted) and no direct UPDATE on hat_flags.
--    Every client call site already goes through an RPC (checked: app/(app)/hats/actions.ts,
--    components/workshop/NewHatDialog.tsx, components/passport/ClaimDialog.tsx).
--    The descriptive hat columns (weaver_id, grade, rows_per_inch, straw, size_cm, price_usd)
--    stay updatable for a future "Edit details" form; hats_guard and RLS still apply there.
-- 2. advance_hat, create_hat, transfer_hat, archive_hat and mark_flag_reviewed are security
--    definer with a pinned search_path. They bypass RLS, so each one checks the caller
--    explicitly: signed in, has a workshop, and the hat belongs to my_workshop_id().
--    Signatures, return shapes and error codes are unchanged.
--
-- Note: inside a definer function current_user is the owner, so hats_guard's "app user insert"
-- branch does not run for create_hat. create_hat sets stage 0, version 1 (default) and
-- owner_type 'workshop' itself, which is what that branch enforces.

revoke insert on public.hats, public.hat_events from authenticated;
revoke update (stage, archived, owner_type, transfer_email, version) on public.hats from authenticated;
revoke update (reviewed_by, review_reason, reviewed_at) on public.hat_flags from authenticated;

-- ---------------------------------------------------------------------------
-- advance_hat
-- ---------------------------------------------------------------------------

create or replace function public.advance_hat(p_code text, p_expected_version int, p_note text default null)
returns table (code text, stage smallint, version int)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_ws  uuid := public.my_workshop_id();
  h hats%rowtype;
begin
  if v_uid is null or v_ws is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into h from hats where hats.code = upper(btrim(coalesce(p_code, '')));
  if not found or h.workshop_id is distinct from v_ws then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if h.archived then raise exception 'archived'; end if;
  if h.owner_type <> 'workshop' or h.transfer_email is not null then raise exception 'not_owner'; end if;
  if h.stage >= 4 then raise exception 'finished'; end if;

  update hats set stage = h.stage + 1
   where hats.id = h.id and hats.version = p_expected_version
     and hats.workshop_id = v_ws and hats.owner_type = 'workshop' and hats.transfer_email is null
  returning * into h;
  if not found then raise exception 'version_conflict'; end if;

  insert into hat_events (hat_id, type, from_stage, to_stage, actor_id, source, note)
  values (h.id, 'stage_advanced', h.stage - 1, h.stage, v_uid, 'manual',
          nullif(left(btrim(coalesce(p_note, '')), 500), ''));

  return query select h.code, h.stage, h.version;
end $$;

-- ---------------------------------------------------------------------------
-- create_hat
-- ---------------------------------------------------------------------------

create or replace function public.create_hat(
  p_weaver_id uuid, p_grade text, p_rows int,
  p_straw text default 'Natural', p_size int default null, p_price numeric default null,
  p_note text default null)
returns table (id uuid, code text)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_uid  uuid := auth.uid();
  v_ws   uuid := public.my_workshop_id();
  v_id   uuid;
  v_code text;
  i int;
begin
  if v_uid is null or v_ws is null then raise exception 'no_workshop'; end if;
  if not exists (select 1 from weavers w where w.id = p_weaver_id and w.workshop_id = v_ws) then
    raise exception 'weaver_not_found';
  end if;
  if public.grade_for_rows(p_rows) is distinct from p_grade then
    raise exception 'grade_mismatch' using errcode = 'check_violation';
  end if;

  for i in 1 .. 5 loop
    v_code := public.generate_hat_code();
    begin
      insert into hats (code, workshop_id, weaver_id, grade, rows_per_inch, straw, size_cm, price_usd,
                        stage, version, archived, owner_type, owner_user_id, transfer_email,
                        weaving_started_at)
      values (v_code, v_ws, p_weaver_id, p_grade, p_rows, coalesce(p_straw, 'Natural'), p_size, p_price,
              0, 1, false, 'workshop', null, null, now())
      returning hats.id into v_id;
      exit;
    exception when unique_violation then
      if i = 5 then raise; end if;
    end;
  end loop;

  insert into hat_events (hat_id, type, from_stage, to_stage, actor_id, source, note)
  values (v_id, 'created', null, 0, v_uid, 'manual', nullif(left(btrim(coalesce(p_note, '')), 500), ''));

  return query select v_id, v_code;
end $$;

-- ---------------------------------------------------------------------------
-- transfer_hat
-- ---------------------------------------------------------------------------

create or replace function public.transfer_hat(
  p_code text, p_expected_version int, p_to text, p_email text, p_message text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_ws  uuid := public.my_workshop_id();
  h hats%rowtype;
begin
  if v_uid is null or v_ws is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_to is null or p_to not in ('seller', 'buyer') then raise exception 'invalid_target'; end if;
  if coalesce(p_email, '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'invalid_email'; end if;
  update hats set owner_type = p_to, transfer_email = lower(btrim(p_email))
   where hats.code = upper(btrim(coalesce(p_code, ''))) and hats.version = p_expected_version
     and owner_type = 'workshop' and transfer_email is null and not archived
     and workshop_id = v_ws
  returning * into h;
  if not found then raise exception 'version_conflict'; end if;
  insert into hat_events (hat_id, type, actor_id, source, note)
  values (h.id, 'transferred', v_uid, 'manual', nullif(left(btrim(coalesce(p_message, '')), 500), ''));
  return jsonb_build_object('code', h.code, 'version', h.version, 'owner_type', h.owner_type);
end $$;

-- ---------------------------------------------------------------------------
-- archive_hat
-- ---------------------------------------------------------------------------

create or replace function public.archive_hat(p_code text, p_expected_version int, p_note text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_ws  uuid := public.my_workshop_id();
  h hats%rowtype;
begin
  if v_uid is null or v_ws is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- Same scope the old RLS policy gave: only while the workshop owns it, no pending transfer.
  update hats set archived = true
   where hats.code = upper(btrim(coalesce(p_code, ''))) and hats.version = p_expected_version
     and not archived and workshop_id = v_ws
     and owner_type = 'workshop' and transfer_email is null
  returning * into h;
  if not found then raise exception 'version_conflict'; end if;
  insert into hat_events (hat_id, type, actor_id, source, note)
  values (h.id, 'archived', v_uid, 'manual', nullif(left(btrim(coalesce(p_note, '')), 500), ''));
  return jsonb_build_object('code', h.code, 'version', h.version, 'archived', true);
end $$;

-- ---------------------------------------------------------------------------
-- mark_flag_reviewed
-- ---------------------------------------------------------------------------

create or replace function public.mark_flag_reviewed(p_flag_id uuid, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_ws  uuid := public.my_workshop_id();
  f hat_flags%rowtype;
begin
  if v_uid is null or v_ws is null then
    raise exception 'not_found_or_reviewed' using errcode = 'P0002';
  end if;
  update hat_flags
     set reviewed_by = v_uid,
         review_reason = nullif(left(btrim(coalesce(p_reason, '')), 300), ''),
         reviewed_at = now()
   where hat_flags.id = p_flag_id and reviewed_at is null
     and exists (select 1 from hats h where h.id = hat_flags.hat_id and h.workshop_id = v_ws)
  returning * into f;
  if not found then raise exception 'not_found_or_reviewed' using errcode = 'P0002'; end if;
  insert into hat_events (hat_id, type, actor_id, source, note)
  values (f.hat_id, 'flag_reviewed', v_uid, 'manual', left(coalesce(f.review_reason, f.kind), 500));
  return jsonb_build_object('flag_id', f.id, 'reviewed_at', f.reviewed_at);
end $$;

-- Grants: definer functions must never be callable by anon or PUBLIC.
revoke all on function public.advance_hat(text, int, text) from public, anon;
revoke all on function public.create_hat(uuid, text, int, text, int, numeric, text) from public, anon;
revoke all on function public.transfer_hat(text, int, text, text, text) from public, anon;
revoke all on function public.archive_hat(text, int, text) from public, anon;
revoke all on function public.mark_flag_reviewed(uuid, text) from public, anon;
grant execute on function public.advance_hat(text, int, text) to authenticated;
grant execute on function public.create_hat(uuid, text, int, text, int, numeric, text) to authenticated;
grant execute on function public.transfer_hat(text, int, text, text, text) to authenticated;
grant execute on function public.archive_hat(text, int, text) to authenticated;
grant execute on function public.mark_flag_reviewed(uuid, text) to authenticated;
