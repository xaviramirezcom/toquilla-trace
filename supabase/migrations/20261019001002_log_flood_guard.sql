-- Security review S4 (partial): anonymous log RPCs could insert unlimited app_logs rows.
--
-- 1. log_flood_guard(action): a simple global cap. When more than 300 rows with the same action
--    were written in the last minute, the call fails with 'log_rate_limited' and nothing is stored.
--    It is global, not per visitor (the database never sees the visitor's IP), so a flood pauses
--    that one action's anonymous logs for everyone for up to a minute; the app keeps working
--    because logging never blocks a page (lib/log.ts and lib/passport/server.ts swallow errors).
-- 2. log_public rejects a raw payload over 8 KB ('payload_too_large') before doing any work.
--    Stored rows were already capped (message 500 chars, error 4 KB, payload 2 KB).
-- 3. log_passport_view gets the same guard. Its inputs are already short (code cut to 12 chars).
--
-- Residual risk (docs/SECURITY.md): one client can still write up to 300 rows per action per
-- minute (about 430k rows a day per action at most), and can fill the cap to drop real logs.
-- The real fix is an Edge Function with a per-IP limit in front of anonymous logging.

create or replace function public.log_flood_guard(p_action text)
returns void
language plpgsql volatile set search_path = public, pg_temp as $$
begin
  -- Counting stops at 301 rows, so the check stays cheap (index app_logs_action_idx).
  if (select count(*) from (
        select 1 from app_logs
         where action = p_action and created_at > now() - interval '1 minute'
         limit 301) recent) > 300 then
    raise exception 'log_rate_limited';
  end if;
end $$;

-- Only the definer logging functions below call it (they run as the owner).
revoke all on function public.log_flood_guard(text) from public, anon, authenticated;

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
     ('auth.login_failed', 'auth.signup', 'passport.view', 'passport.verify_failed', 'ui.error',
      'concierge.feedback') then
    raise exception 'action_not_allowed' using errcode = 'insufficient_privilege';
  end if;
  if pg_column_size(v_payload) > 8192 then
    raise exception 'payload_too_large';
  end if;
  perform public.log_flood_guard(v_action);

  if jsonb_typeof(v_payload) <> 'object' then
    v_payload := '{}'::jsonb;
  end if;
  if v_level not in ('debug', 'info', 'warn', 'error') then
    v_level := 'warn';
  end if;

  v_req := case when v_payload ->> 'request_id' ~ '^req_[0-9a-f]{12}$' then v_payload ->> 'request_id' end;
  v_msg := left(v_payload ->> 'message', 500);
  v_hat := left(regexp_replace(upper(coalesce(v_payload ->> 'hat_code', '')), '[^A-Z0-9-]', '', 'g'), 12);
  v_err := case when jsonb_typeof(v_payload -> 'error') = 'object'
                then public.strip_pii_keys(v_payload -> 'error') end;
  if v_err is not null and pg_column_size(v_err) > 4096 then
    v_err := jsonb_build_object('message', left(v_err ->> 'message', 500), 'truncated', true);
  end if;

  -- Drop the fields lifted into columns, then strip identifying keys at every depth.
  v_payload := public.strip_pii_keys(v_payload - array['request_id', 'message', 'error', 'hat_code']);
  if pg_column_size(v_payload) > 2048 then
    v_payload := jsonb_build_object('truncated', true);
  end if;

  insert into app_logs (level, source, action, message, request_id, hat_code, payload, error)
  values (v_level, 'web', v_action, v_msg, v_req, nullif(v_hat, ''), v_payload, v_err);
end $$;

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
  perform public.log_flood_guard(case when v_found then 'passport.view' else 'passport.verify_failed' end);
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

-- create or replace keeps existing grants; restated so this file reads on its own.
revoke all on function public.log_public(text, text, jsonb) from public;
revoke all on function public.log_passport_view(text, text, boolean, text) from public;
grant execute on function public.log_public(text, text, jsonb) to anon, authenticated;
grant execute on function public.log_passport_view(text, text, boolean, text) to anon, authenticated;
