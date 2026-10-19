-- Fix-up for 20261019000003_functions.sql (already applied, so not edited in place).
-- version_conflict was raised with SQLSTATE 40001 (serialization_failure). PostgREST retries
-- 40001 automatically, so a stale-version call spun until the gateway timed out (HTTP 504)
-- instead of failing fast. These functions now raise version_conflict with the default
-- SQLSTATE P0001 (HTTP 400 through PostgREST). Bodies are otherwise unchanged; create or
-- replace keeps the existing grants.

create or replace function public.advance_hat(p_code text, p_expected_version int, p_note text default null)
returns table (code text, stage smallint, version int)
language plpgsql volatile security invoker set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  h hats%rowtype;
begin
  select * into h from hats where hats.code = upper(btrim(coalesce(p_code, '')));
  if not found or h.workshop_id is distinct from public.my_workshop_id() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if h.archived then raise exception 'archived'; end if;
  if h.owner_type <> 'workshop' or h.transfer_email is not null then raise exception 'not_owner'; end if;
  if h.stage >= 4 then raise exception 'finished'; end if;

  update hats set stage = h.stage + 1
   where hats.id = h.id and hats.version = p_expected_version
  returning * into h;
  if not found then raise exception 'version_conflict'; end if;

  insert into hat_events (hat_id, type, from_stage, to_stage, actor_id, source, note)
  values (h.id, 'stage_advanced', h.stage - 1, h.stage, auth.uid(), 'manual',
          nullif(left(btrim(coalesce(p_note, '')), 500), ''));

  return query select h.code, h.stage, h.version;
end $$;

create or replace function public.transfer_hat(
  p_code text, p_expected_version int, p_to text, p_email text, p_message text default null)
returns jsonb
language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare h hats%rowtype;
begin
  if p_to not in ('seller', 'buyer') then raise exception 'invalid_target'; end if;
  if coalesce(p_email, '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'invalid_email'; end if;
  update hats set owner_type = p_to, transfer_email = lower(btrim(p_email))
   where hats.code = upper(btrim(p_code)) and hats.version = p_expected_version
     and owner_type = 'workshop' and transfer_email is null and not archived
     and workshop_id = public.my_workshop_id()
  returning * into h;
  if not found then raise exception 'version_conflict'; end if;
  insert into hat_events (hat_id, type, actor_id, source, note)
  values (h.id, 'transferred', auth.uid(), 'manual', nullif(left(btrim(coalesce(p_message, '')), 500), ''));
  return jsonb_build_object('code', h.code, 'version', h.version, 'owner_type', h.owner_type);
end $$;

create or replace function public.archive_hat(p_code text, p_expected_version int, p_note text default null)
returns jsonb
language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare h hats%rowtype;
begin
  update hats set archived = true
   where hats.code = upper(btrim(p_code)) and hats.version = p_expected_version
     and not archived and workshop_id = public.my_workshop_id()
  returning * into h;
  if not found then raise exception 'version_conflict'; end if;
  insert into hat_events (hat_id, type, actor_id, source, note)
  values (h.id, 'archived', auth.uid(), 'manual', nullif(left(btrim(coalesce(p_note, '')), 500), ''));
  return jsonb_build_object('code', h.code, 'version', h.version, 'archived', true);
end $$;

create or replace function public.apply_proposal(
  p_proposal_id uuid, p_actor uuid, p_payload jsonb, p_edits jsonb default null, p_codes text[] default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_prop    proposals%rowtype;
  v_hat     hats%rowtype;
  v_codes   text[] := '{}';
  v_flag    uuid;
  v_qty     int;
  v_code    text;
  v_version int;
  i int;
  j int;
begin
  select * into v_prop from proposals where id = p_proposal_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_prop.status = 'approved' then
    return jsonb_build_object('status', 'approved', 'idempotent', true,
      'hat_codes', coalesce(v_prop.rule_result -> 'hat_codes', '[]'::jsonb));
  end if;
  if v_prop.status in ('rejected', 'dismissed') then raise exception 'not_open'; end if;

  if v_prop.type = 'create_hat' then
    v_qty := (p_payload ->> 'quantity')::int;
    if v_qty is null or v_qty not between 1 and 20 then raise exception 'quantity_range'; end if;
    if not exists (select 1 from weavers w where w.id = (p_payload ->> 'weaver_id')::uuid
                   and w.workshop_id = v_prop.workshop_id) then
      raise exception 'weaver_not_found';
    end if;
    for i in 1 .. v_qty loop
      v_code := case when p_codes is not null and array_length(p_codes, 1) >= i then p_codes[i] end;
      for j in 1 .. 5 loop
        begin
          insert into hats (code, workshop_id, weaver_id, grade, rows_per_inch, straw,
                            stage, owner_type, version, weaving_started_at)
          values (coalesce(v_code, public.generate_hat_code()), v_prop.workshop_id,
                  (p_payload ->> 'weaver_id')::uuid, p_payload ->> 'grade', (p_payload ->> 'rows_per_inch')::int,
                  coalesce(p_payload ->> 'straw', 'Natural'), 0, 'workshop', 1, now())
          returning * into v_hat;
          exit;
        exception when unique_violation then
          -- A caller-supplied code collided: surface it (caller regenerates). Generated: retry.
          if v_code is not null or j = 5 then raise; end if;
        end;
      end loop;
      insert into hat_events (hat_id, type, from_stage, to_stage, actor_id, source, note, run_id)
      values (v_hat.id, 'created', null, 0, p_actor, 'ai_proposal', left(v_prop.quote, 500), v_prop.run_id);
      v_codes := v_codes || v_hat.code;
    end loop;

  elsif v_prop.type = 'advance_stage' then
    v_version := coalesce((p_payload ->> 'expected_version')::int, (p_payload ->> 'hat_version')::int);
    update hats
       set stage = (p_payload ->> 'to_stage')::smallint
     where id = (p_payload ->> 'hat_id')::uuid
       and workshop_id = v_prop.workshop_id
       and owner_type = 'workshop' and transfer_email is null and not archived
       and version = v_version
       and (p_payload ->> 'to_stage')::int = stage + 1          -- forward one step only
    returning * into v_hat;
    if not found then raise exception 'version_conflict'; end if;
    insert into hat_events (hat_id, type, from_stage, to_stage, actor_id, source, note, run_id)
    values (v_hat.id, 'stage_advanced', v_hat.stage - 1, v_hat.stage, p_actor,
            'ai_proposal', left(v_prop.quote, 500), v_prop.run_id);
    v_codes := array[v_hat.code];

  elsif v_prop.type = 'flag_issue' then
    select * into v_hat from hats
     where id = (p_payload ->> 'hat_id')::uuid and workshop_id = v_prop.workshop_id and not archived;
    if not found then raise exception 'hat_unavailable'; end if;
    insert into hat_flags (hat_id, kind, message, raised_by)
    values (v_hat.id, coalesce(p_payload ->> 'kind', 'other'), left(p_payload ->> 'message', 200), 'assistant')
    returning id into v_flag;
    insert into hat_events (hat_id, type, actor_id, source, note, run_id)
    values (v_hat.id, 'flag_raised', p_actor, 'ai_proposal', left(v_prop.quote, 500), v_prop.run_id);
    v_codes := array[v_hat.code];
  end if;

  update proposals
     set status = 'approved',
         edits = p_edits,
         edited = (p_edits is not null and p_edits <> '{}'::jsonb),
         decided_by = p_actor, decided_at = now(),
         rule_result = coalesce(rule_result, '{}'::jsonb)
                       || jsonb_build_object('hat_codes', to_jsonb(v_codes), 'flag_id', v_flag, 'applied_at', now())
   where id = p_proposal_id;

  return jsonb_build_object('status', 'approved', 'hat_codes', to_jsonb(v_codes), 'flag_id', v_flag);
end $$;
