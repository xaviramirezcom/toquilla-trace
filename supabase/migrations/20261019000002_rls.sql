-- Toquilla Trace: row-level security, table and column grants.
-- Specs: 01 section 5.4/5.5, conventions section 3 and decisions D4, D5, D7, 09 section 5.1.
-- Model: members read and write their own workshop only; admins read everything and write only
-- inside their own (HQ) workshop (D7); anon reads nothing directly (passport goes through
-- public_hat_passport()); Edge Functions use the service role.

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table public.workshops  enable row level security;
alter table public.profiles   enable row level security;
alter table public.weavers    enable row level security;
alter table public.hats       enable row level security;
alter table public.hat_events enable row level security;
alter table public.hat_flags  enable row level security;
alter table public.agent_runs enable row level security;
alter table public.proposals  enable row level security;
alter table public.app_logs   enable row level security;

-- ---------------------------------------------------------------------------
-- Table and column privileges (explicit, so nothing depends on auto-expose defaults)
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Reads (rows still filtered by RLS).
grant select on public.workshops, public.profiles, public.weavers, public.hats, public.hat_events,
                public.hat_flags, public.agent_runs, public.proposals, public.app_logs
  to authenticated;

-- Inserts members may do (rows still filtered by RLS). No insert on workshops/profiles
-- (trigger), agent_runs (D5), proposals (D4) or hat_flags (service role only).
grant insert on public.weavers, public.hats, public.hat_events, public.app_logs to authenticated;
grant usage on all sequences in schema public to authenticated;

-- Column-level updates: role and workshop_id are never updatable by users.
grant update (name) on public.profiles to authenticated;
grant update (name, city, contact_email, show_prices) on public.workshops to authenticated;
grant update (name, village, province, specialty, weaving_since, bio, show_name)
  on public.weavers to authenticated;
grant update (weaver_id, grade, rows_per_inch, straw, size_cm, price_usd, stage, archived,
              owner_type, transfer_email)
  on public.hats to authenticated;           -- never id, code, workshop_id, owner_user_id, version
grant update (reviewed_by, review_reason, reviewed_at) on public.hat_flags to authenticated;
-- No update/delete on hat_events, agent_runs, proposals, app_logs for clients. No deletes at all.

-- ---------------------------------------------------------------------------
-- workshops: own or admin read; own update. Insert only via the auth trigger.
-- ---------------------------------------------------------------------------

create policy ws_select on public.workshops for select to authenticated
  using (id = (select public.my_workshop_id()) or (select public.is_admin()));
create policy ws_update on public.workshops for update to authenticated
  using (id = (select public.my_workshop_id()))
  with check (id = (select public.my_workshop_id()));

-- ---------------------------------------------------------------------------
-- profiles: self, same workshop or admin read; self update (name only, by grant).
-- ---------------------------------------------------------------------------

create policy pr_select on public.profiles for select to authenticated
  using (id = (select auth.uid())
         or workshop_id = (select public.my_workshop_id())
         or (select public.is_admin()));
create policy pr_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- weavers: own workshop read/insert/update, admin read. No delete.
-- ---------------------------------------------------------------------------

create policy wv_select on public.weavers for select to authenticated
  using (workshop_id = (select public.my_workshop_id()) or (select public.is_admin()));
create policy wv_insert on public.weavers for insert to authenticated
  with check (workshop_id = (select public.my_workshop_id()));
create policy wv_update on public.weavers for update to authenticated
  using (workshop_id = (select public.my_workshop_id()))
  with check (workshop_id = (select public.my_workshop_id()));

-- ---------------------------------------------------------------------------
-- hats: own workshop or admin read. Insert into own workshop (hats_guard forces Weaving).
-- Update only while the workshop owns it and no transfer is pending.
-- ---------------------------------------------------------------------------

create policy hat_select on public.hats for select to authenticated
  using (workshop_id = (select public.my_workshop_id()) or (select public.is_admin()));
create policy hat_insert on public.hats for insert to authenticated
  with check (workshop_id = (select public.my_workshop_id()) and owner_type = 'workshop');
create policy hat_update on public.hats for update to authenticated
  using (workshop_id = (select public.my_workshop_id())
         and owner_type = 'workshop' and transfer_email is null)
  with check (workshop_id = (select public.my_workshop_id()));

-- ---------------------------------------------------------------------------
-- hat_events: read via hat; insert as yourself on your own workshop's hats. Append-only.
-- ---------------------------------------------------------------------------

create policy ev_select on public.hat_events for select to authenticated
  using (exists (select 1 from public.hats h where h.id = hat_id
                 and (h.workshop_id = (select public.my_workshop_id()) or (select public.is_admin()))));
create policy ev_insert on public.hat_events for insert to authenticated
  with check (actor_id = (select auth.uid())
              and exists (select 1 from public.hats h where h.id = hat_id
                          and h.workshop_id = (select public.my_workshop_id())));

-- ---------------------------------------------------------------------------
-- hat_flags: read via hat. No client insert. Review once, as yourself, own workshop.
-- ---------------------------------------------------------------------------

create policy fl_select on public.hat_flags for select to authenticated
  using (exists (select 1 from public.hats h where h.id = hat_id
                 and (h.workshop_id = (select public.my_workshop_id()) or (select public.is_admin()))));
create policy fl_update on public.hat_flags for update to authenticated
  using (reviewed_at is null
         and exists (select 1 from public.hats h where h.id = hat_id
                     and h.workshop_id = (select public.my_workshop_id())))
  with check (reviewed_by = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- agent_runs: admin read only. Inserts only by the service role (D5).
-- ---------------------------------------------------------------------------

create policy run_select on public.agent_runs for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- proposals: own workshop or admin read. Writes only via Edge Functions / RPCs (D4).
-- ---------------------------------------------------------------------------

create policy prop_select on public.proposals for select to authenticated
  using (workshop_id = (select public.my_workshop_id()) or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- app_logs: admin read only. Signed-in users insert their own web rows only.
-- ---------------------------------------------------------------------------

create policy log_select on public.app_logs for select to authenticated
  using ((select public.is_admin()));
create policy log_insert on public.app_logs for insert to authenticated
  with check (user_id = (select auth.uid())
              and source = 'web'
              and (workshop_id is null or workshop_id = (select public.my_workshop_id())));
