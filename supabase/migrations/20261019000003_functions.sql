-- Toquilla Trace: RPC functions and their grants.
-- Signatures and callers are listed in supabase/seed-notes.md.
-- Error convention: functions raise exceptions whose message is a short code
-- (not_found, version_conflict, archived, ...), so callers can map them to copy.

-- ---------------------------------------------------------------------------
-- Code generator (D1): new codes use CODE_ALPHABET only (no I, O, 0, 1).
-- 256 is a multiple of 32, so "byte % 32" is uniform. Bytes come from gen_random_uuid(),
-- whose first 6 bytes are fully random in a v4 UUID.
-- ---------------------------------------------------------------------------

create or replace function public.generate_hat_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  v_alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_body  text := '';
  i int;
begin
  for i in 0 .. 4 loop
    v_body := v_body || substr(v_alpha, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return 'TQ-' || v_body;
end $$;

-- ---------------------------------------------------------------------------
-- public_hat_passport(p_code): the only way anon reads a hat (spec 06, fixed shape).
-- Never returns uuids, transfer_email, owner_user_id, actor ids, notes, run ids, version,
-- a hidden price or a hidden weaver name/bio. Unknown or malformed code -> null.
-- ---------------------------------------------------------------------------

create or replace function public.public_hat_passport(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_code   text := upper(btrim(coalesce(p_code, '')));
  v_hat    hats%rowtype;
  v_ws     workshops%rowtype;
  v_wv     weavers%rowtype;
  v_uid    uuid := auth.uid();
  v_email  text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_viewer text;
begin
  if v_code !~ '^TQ-[A-Z0-9]{5}$' then
    return null;
  end if;

  select * into v_hat from hats where code = v_code;
  if not found then
    return null;
  end if;

  select * into v_ws from workshops where id = v_hat.workshop_id;
  select * into v_wv from weavers where id = v_hat.weaver_id;

  v_viewer := case
    when v_uid is null then 'anonymous'
    when v_hat.owner_user_id is not null and v_hat.owner_user_id = v_uid then 'owner'
    when v_hat.transfer_email is not null and v_email <> ''
         and lower(v_hat.transfer_email) = v_email then 'recipient'
    else 'other'
  end;

  return jsonb_build_object(
    'code',               v_hat.code,
    'archived',           v_hat.archived,
    'grade',              v_hat.grade,
    'rows_per_inch',      v_hat.rows_per_inch,
    'straw',              v_hat.straw,
    'size_cm',            v_hat.size_cm,
    'price_usd',          case when v_ws.show_prices then v_hat.price_usd end,
    'stage',              v_hat.stage,
    'weaving_started_at', v_hat.weaving_started_at,
    'created_at',         v_hat.created_at,
    'workshop', jsonb_build_object(
      'name', v_ws.name, 'city', v_ws.city, 'contact_email', v_ws.contact_email),
    'weaver', case when v_wv.id is null then null else jsonb_build_object(
      'name',          case when v_wv.show_name then v_wv.name end,
      'village',       v_wv.village,
      'province',      v_wv.province,
      'weaving_since', v_wv.weaving_since,
      'specialty',     v_wv.specialty,
      'bio',           case when v_wv.show_name then v_wv.bio end,
      'other_hats',    (select count(*) from hats o
                         where o.weaver_id = v_wv.id and o.id <> v_hat.id and not o.archived)
    ) end,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', e.type, 'from_stage', e.from_stage,
               'to_stage', e.to_stage, 'at', e.created_at) order by e.created_at, e.id)
      from hat_events e
      where e.hat_id = v_hat.id
        and e.type in ('created', 'stage_advanced', 'transferred', 'claimed', 'archived')
    ), '[]'::jsonb),
    'open_flags', (select count(*) from hat_flags f
                    where f.hat_id = v_hat.id and f.reviewed_at is null),
    'ownership', jsonb_build_object(
      'owner_type',       v_hat.owner_type,
      'pending_transfer', v_hat.transfer_email is not null),
    'viewer', v_viewer
  );
end $$;

-- ---------------------------------------------------------------------------
-- log_passport_view (spec 06): server-side passport view log. Existence decided here.
-- ---------------------------------------------------------------------------

create or replace function public.log_passport_view(
  p_code text, p_via text default 'link', p_is_bot boolean default false, p_request_id text default null)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_code  text := left(regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9-]', '', 'g'), 12);
  v_ws    uuid;
  v_found boolean;
begin
  select workshop_id into v_ws from hats where code = v_code;
  v_found := found;
  insert into app_logs (level, source, action, message, request_id, hat_code, workshop_id, payload)
  values (case when v_found then 'info' else 'warn' end, 'db',
          case when v_found then 'passport.view' else 'passport.verify_failed' end,
          case when v_found then 'Passport viewed' else 'Code not in records' end,
          case when p_request_id ~ '^req_[0-9a-f]{12}$' then p_request_id end,
          nullif(v_code, ''), v_ws,
          jsonb_build_object(
            'via', case when p_via in ('qr', 'link', 'verify_box', 'retry') then p_via else 'link' end,
            'is_bot', coalesce(p_is_bot, false),
            'reason', case when v_found then null
                           when v_code !~ '^TQ-[A-Z0-9]{5}$' then 'invalid_format'
                           else 'not_found' end));
end $$;

-- ---------------------------------------------------------------------------
-- log_public(action, level, payload) (D6): anonymous logging with an allowlist.
-- Parameter names match lib/log.ts (rpc("log_public", { action, level, payload })).
-- No user id, IP or email is stored; email_hash and email_domain are allowed.
-- ---------------------------------------------------------------------------

create or replace function public.log_public(action text, level text, payload jsonb default '{}'::jsonb)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_action  text := log_public.action;
  v_level   text := coalesce(log_public.level, 'warn');
  v_payload jsonb := coalesce(log_public.payload, '{}'::jsonb);
  v_req     text;
  v_msg     text;
  v_hat     text;
  v_err     jsonb;
begin
  if v_action is null or v_action not in
     ('auth.login_failed', 'auth.signup', 'passport.view', 'passport.verify_failed', 'ui.error') then
    raise exception 'action_not_allowed' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(v_payload) <> 'object' then
    v_payload := '{}'::jsonb;
  end if;
  -- auth.signup only for failures (a successful sign-up has a session and logs normally).
  if v_action = 'auth.signup' and coalesce(v_payload ->> 'ok', 'false') = 'true' then
    raise exception 'action_not_allowed' using errcode = 'insufficient_privilege';
  end if;
  if v_level not in ('debug', 'info', 'warn', 'error') then
    v_level := 'warn';
  end if;

  v_req := case when v_payload ->> 'request_id' ~ '^req_[0-9a-f]{12}$' then v_payload ->> 'request_id' end;
  v_msg := left(v_payload ->> 'message', 500);
  v_hat := left(regexp_replace(upper(coalesce(v_payload ->> 'hat_code', '')), '[^A-Z0-9-]', '', 'g'), 12);
  v_err := case when jsonb_typeof(v_payload -> 'error') = 'object' then v_payload -> 'error' end;
  if v_err is not null and pg_column_size(v_err) > 4096 then
    v_err := jsonb_build_object('message', left(v_err ->> 'message', 500), 'truncated', true);
  end if;

  -- Strip identifying keys and the fields lifted into columns.
  v_payload := v_payload - array['email', 'user_id', 'ip', 'ip_address', 'password', 'token',
                                 'access_token', 'refresh_token', 'request_id', 'message', 'error'];
  if pg_column_size(v_payload) > 2048 then
    v_payload := jsonb_build_object('truncated', true);
  end if;

  insert into app_logs (level, source, action, message, request_id, hat_code, payload, error)
  values (v_level, 'web', v_action, v_msg, v_req, nullif(v_hat, ''), v_payload, v_err);
end $$;

-- ---------------------------------------------------------------------------
-- claim_hat(p_code, p_request_id) (spec 06 + D11): confirmed email must match transfer_email.
-- One conditional update, so two tabs can't both win. Unknown code -> not_recipient (no oracle).
-- ---------------------------------------------------------------------------

create or replace function public.claim_hat(p_code text, p_request_id text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid       uuid := auth.uid();
  v_code      text := upper(btrim(coalesce(p_code, '')));
  v_email     text;
  v_confirmed timestamptz;
  v_hat       hats%rowtype;
  v_prev      text;
  v_ws        uuid;
  v_req       text := case when p_request_id ~ '^req_[0-9a-f]{12}$' then p_request_id end;
  v_result    text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'result', 'not_authenticated');
  end if;

  select lower(email), email_confirmed_at into v_email, v_confirmed
  from auth.users where id = v_uid;

  select owner_type, workshop_id into v_prev, v_ws from hats where code = v_code;

  if v_confirmed is null then
    v_result := 'email_unconfirmed';
  else
    update hats
       set owner_type = 'buyer', owner_user_id = v_uid, transfer_email = null
     where code = v_code
       and not archived
       and transfer_email is not null
       and lower(transfer_email) = v_email
    returning * into v_hat;

    if found then
      v_result := 'claimed';
      insert into hat_events (hat_id, type, from_stage, to_stage, actor_id, source)
      values (v_hat.id, 'claimed', null, null, v_uid, 'manual');
    elsif exists (select 1 from hats where code = v_code
                    and owner_type = 'buyer' and owner_user_id = v_uid) then
      v_result := 'already_owner';
    else
      v_result := 'not_recipient';
    end if;
  end if;

  insert into app_logs (level, source, action, message, user_id, workshop_id, request_id, hat_code, payload)
  values (case when v_result in ('claimed', 'already_owner') then 'info' else 'warn' end,
          'db', 'hat.claim', 'Claim attempt: ' || v_result, v_uid,
          case when v_result in ('claimed', 'already_owner') then v_ws end,
          v_req, left(v_code, 12),
          jsonb_build_object('result', v_result, 'from_owner_type',
                             case when v_result = 'claimed' then v_prev end));

  return jsonb_build_object('ok', v_result in ('claimed', 'already_owner'),
                            'result', v_result, 'claimed_at', case when v_result = 'claimed' then now() end);
end $$;

-- ---------------------------------------------------------------------------
-- advance_hat(p_code, p_expected_version, p_note) (spec 08): security invoker, RLS applies.
-- Only ever moves to the next stage. Stale version -> version_conflict.
-- ---------------------------------------------------------------------------

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
  if not found then raise exception 'version_conflict' using errcode = '40001'; end if;

  insert into hat_events (hat_id, type, from_stage, to_stage, actor_id, source, note)
  values (h.id, 'stage_advanced', h.stage - 1, h.stage, auth.uid(), 'manual',
          nullif(left(btrim(coalesce(p_note, '')), 500), ''));

  return query select h.code, h.stage, h.version;
end $$;

-- ---------------------------------------------------------------------------
-- create_hat(...) (spec 08 + D1 + D15): security invoker. Generates the code here (retries on a
-- collision), always starts at Weaving. Blocks a grade/rows mismatch for new writes (D10).
-- ---------------------------------------------------------------------------

create or replace function public.create_hat(
  p_weaver_id uuid, p_grade text, p_rows int,
  p_straw text default 'Natural', p_size int default null, p_price numeric default null,
  p_note text default null)
returns table (id uuid, code text)
language plpgsql volatile security invoker set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_ws   uuid := public.my_workshop_id();
  v_id   uuid;
  v_code text;
  i int;
begin
  if v_ws is null then raise exception 'no_workshop'; end if;
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
                        stage, owner_type, weaving_started_at)
      values (v_code, v_ws, p_weaver_id, p_grade, p_rows, coalesce(p_straw, 'Natural'), p_size, p_price,
              0, 'workshop', now())
      returning hats.id into v_id;
      exit;
    exception when unique_violation then
      if i = 5 then raise; end if;
    end;
  end loop;

  insert into hat_events (hat_id, type, from_stage, to_stage, actor_id, source, note)
  values (v_id, 'created', null, 0, auth.uid(), 'manual', nullif(left(btrim(coalesce(p_note, '')), 500), ''));

  return query select v_id, v_code;
end $$;

-- ---------------------------------------------------------------------------
-- transfer_hat / archive_hat (spec 08, Nice): security invoker, one statement + event.
-- ---------------------------------------------------------------------------

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
  if not found then raise exception 'version_conflict' using errcode = '40001'; end if;
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
  if not found then raise exception 'version_conflict' using errcode = '40001'; end if;
  insert into hat_events (hat_id, type, actor_id, source, note)
  values (h.id, 'archived', auth.uid(), 'manual', nullif(left(btrim(coalesce(p_note, '')), 500), ''));
  return jsonb_build_object('code', h.code, 'version', h.version, 'archived', true);
end $$;

-- ---------------------------------------------------------------------------
-- mark_flag_reviewed(p_flag_id, p_reason): security invoker. Review once, plus an event.
-- ---------------------------------------------------------------------------

create or replace function public.mark_flag_reviewed(p_flag_id uuid, p_reason text default null)
returns jsonb
language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare f hat_flags%rowtype;
begin
  update hat_flags
     set reviewed_by = auth.uid(),
         review_reason = nullif(left(btrim(coalesce(p_reason, '')), 300), ''),
         reviewed_at = now()
   where hat_flags.id = p_flag_id and reviewed_at is null
  returning * into f;
  if not found then raise exception 'not_found_or_reviewed' using errcode = 'P0002'; end if;
  insert into hat_events (hat_id, type, actor_id, source, note)
  values (f.hat_id, 'flag_reviewed', auth.uid(), 'manual', left(coalesce(f.review_reason, f.kind), 500));
  return jsonb_build_object('flag_id', f.id, 'reviewed_at', f.reviewed_at);
end $$;

-- ---------------------------------------------------------------------------
-- apply_proposal(...) (spec 04): service role only (apply-proposals Edge Function).
-- p_payload is the merged payload (AI payload + whitelisted edits), already checked in TS.
-- p_codes may be null for create_hat: codes are then generated here.
-- ---------------------------------------------------------------------------

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
    if not found then raise exception 'version_conflict' using errcode = '40001'; end if;
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

-- ---------------------------------------------------------------------------
-- restore_proposal(p_id, p_status) (D4, spec 04 Nice): undo a reject/dismiss in your workshop.
-- p_status optional: dismissed -> blocked, rejected -> question (if payload has a question) or pending.
-- ---------------------------------------------------------------------------

create or replace function public.restore_proposal(p_id uuid, p_status text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_prop   proposals%rowtype;
  v_status text;
begin
  select * into v_prop from proposals
   where id = p_id and workshop_id = public.my_workshop_id()
   for update;
  if not found or v_prop.status not in ('rejected', 'dismissed') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_status := coalesce(p_status,
    case when v_prop.status = 'dismissed' then 'blocked'
         when v_prop.payload ? 'question' then 'question'
         else 'pending' end);
  if v_status not in ('pending', 'question', 'blocked') then raise exception 'bad_status'; end if;
  update proposals set status = v_status, decided_by = null, decided_at = null where id = p_id;
  return jsonb_build_object('id', p_id, 'status', v_status);
end $$;

-- ---------------------------------------------------------------------------
-- save_agent_run(...) (spec 03): service role only. Final run state + its proposals, atomically.
-- The run row is inserted earlier by the Edge Function (status running). Returns the created
-- proposals as [{ id, temp_id, type, status }] in input order.
-- ---------------------------------------------------------------------------

create or replace function public.save_agent_run(
  p_run_id uuid, p_status text, p_summary text, p_steps jsonb, p_proposals jsonb,
  p_tokens_in int, p_tokens_out int, p_latency_ms int, p_cost_usd numeric, p_model text,
  p_error jsonb default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_ws   uuid;
  v_out  jsonb := '[]'::jsonb;
  v_item jsonb;
  v_n    bigint;
  v_id   uuid;
begin
  update agent_runs
     set status = p_status, summary = p_summary, steps = coalesce(p_steps, '[]'::jsonb),
         tokens_in = p_tokens_in, tokens_out = p_tokens_out, latency_ms = p_latency_ms,
         cost_usd = p_cost_usd, model = p_model, error = p_error
   where id = p_run_id
  returning workshop_id into v_ws;
  if not found then raise exception 'run_not_found' using errcode = 'P0002'; end if;

  if p_proposals is null or jsonb_typeof(p_proposals) <> 'array' or jsonb_array_length(p_proposals) = 0 then
    return '[]'::jsonb;
  end if;
  if v_ws is null then raise exception 'run_has_no_workshop'; end if;

  for v_item, v_n in select x, n from jsonb_array_elements(p_proposals) with ordinality as t(x, n) order by n loop
    insert into proposals (run_id, workshop_id, type, payload, status, why, quote, confidence, rule_result)
    values (p_run_id, v_ws, v_item ->> 'type', coalesce(v_item -> 'payload', '{}'::jsonb),
            coalesce(v_item ->> 'status', 'pending'), v_item ->> 'why', v_item ->> 'quote',
            v_item ->> 'confidence', v_item -> 'rule_result')
    returning id into v_id;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', v_id, 'temp_id', v_item ->> 'temp_id', 'type', v_item ->> 'type',
      'status', coalesce(v_item ->> 'status', 'pending')));
  end loop;
  return v_out;
end $$;

-- ---------------------------------------------------------------------------
-- seed_backfill_actors(p_workshop_id, p_actor): service role only. Used once by
-- scripts/seed-users.mjs to fill NULL actor ids on seeded rows of one workshop.
-- Anonymous rows (passport, concierge, log_public actions) are left untouched.
-- ---------------------------------------------------------------------------

create or replace function public.seed_backfill_actors(p_workshop_id uuid, p_actor uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  n_events int; n_runs int; n_props int; n_flags int; n_logs int;
begin
  if not exists (select 1 from profiles where id = p_actor) then
    raise exception 'actor_not_found';
  end if;
  perform set_config('toquilla.backfill', 'on', true);
  update hat_events e set actor_id = p_actor
   where e.actor_id is null
     and exists (select 1 from hats h where h.id = e.hat_id and h.workshop_id = p_workshop_id);
  get diagnostics n_events = row_count;
  perform set_config('toquilla.backfill', 'off', true);

  update agent_runs set user_id = p_actor
   where user_id is null and agent = 'workshop' and workshop_id = p_workshop_id;
  get diagnostics n_runs = row_count;

  update proposals set decided_by = p_actor
   where decided_by is null and decided_at is not null and workshop_id = p_workshop_id;
  get diagnostics n_props = row_count;

  update hat_flags f set reviewed_by = p_actor
   where f.reviewed_by is null and f.reviewed_at is not null
     and exists (select 1 from hats h where h.id = f.hat_id and h.workshop_id = p_workshop_id);
  get diagnostics n_flags = row_count;

  update app_logs set user_id = p_actor
   where user_id is null and workshop_id = p_workshop_id
     and source in ('web', 'edge:workshop-agent', 'edge:apply-proposals')
     and action not in ('auth.login_failed', 'auth.signup', 'passport.view', 'passport.verify_failed', 'ui.error');
  get diagnostics n_logs = row_count;

  return jsonb_build_object('hat_events', n_events, 'agent_runs', n_runs, 'proposals', n_props,
                            'hat_flags', n_flags, 'app_logs', n_logs);
end $$;

-- ---------------------------------------------------------------------------
-- Grants. Supabase grants EXECUTE to anon/authenticated by default, so revoke first.
-- ---------------------------------------------------------------------------

revoke all on all functions in schema public from public, anon, authenticated;

grant execute on all functions in schema public to service_role;

-- Pure helper, harmless.
grant execute on function public.grade_for_rows(int) to anon, authenticated;

-- Used inside RLS policies and invoker RPCs.
grant execute on function public.my_workshop_id() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.generate_hat_code() to authenticated;

-- Public (anon allowed).
grant execute on function public.public_hat_passport(text) to anon, authenticated;
grant execute on function public.log_passport_view(text, text, boolean, text) to anon, authenticated;
grant execute on function public.log_public(text, text, jsonb) to anon, authenticated;

-- Signed-in users.
grant execute on function public.claim_hat(text, text) to authenticated;
grant execute on function public.advance_hat(text, int, text) to authenticated;
grant execute on function public.create_hat(uuid, text, int, text, int, numeric, text) to authenticated;
grant execute on function public.transfer_hat(text, int, text, text, text) to authenticated;
grant execute on function public.archive_hat(text, int, text) to authenticated;
grant execute on function public.mark_flag_reviewed(uuid, text) to authenticated;
grant execute on function public.restore_proposal(uuid, text) to authenticated;

-- Service role only: apply_proposal, save_agent_run, seed_backfill_actors (granted above via
-- "all functions ... to service_role"; nothing granted to anon or authenticated).
