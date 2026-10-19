-- log_public v2 (docs/SECURITY.md section 11, gaps 6 and 8).
-- 1. auth.signup is accepted with ok = true too: a sign-up that waits for email confirmation
--    has no session, so this RPC is the only way to log it.
-- 2. concierge.feedback (thumbs up/down on a concierge answer) is allowed for anonymous buyers.
-- 3. Identifying and secret keys are stripped at every depth (objects inside objects and
--    arrays), not only at the top level.
-- Signature and grants are unchanged (anon, authenticated).

create or replace function public.strip_pii_keys(p jsonb, p_depth int default 0)
returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p is null then null
    when p_depth > 8 then '"[truncated]"'::jsonb
    when jsonb_typeof(p) = 'object' then coalesce(
      (select jsonb_object_agg(e.key, public.strip_pii_keys(e.value, p_depth + 1))
         from jsonb_each(p) e
        where lower(e.key) not in ('email', 'transfer_email', 'user_id', 'ip', 'ip_address', 'phone',
                                   'password', 'token', 'access_token', 'refresh_token', 'jwt',
                                   'apikey', 'api_key', 'authorization', 'secret', 'service_role')),
      '{}'::jsonb)
    when jsonb_typeof(p) = 'array' then coalesce(
      (select jsonb_agg(public.strip_pii_keys(e.value, p_depth + 1) order by e.ord)
         from jsonb_array_elements(p) with ordinality as e(value, ord)),
      '[]'::jsonb)
    else p
  end
$$;

revoke all on function public.strip_pii_keys(jsonb, int) from public, anon, authenticated;
grant execute on function public.strip_pii_keys(jsonb, int) to service_role;

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
