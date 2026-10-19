-- Toquilla Trace: schema, constraints, indexes, guards and auth trigger.
-- Specs: docs/specs/00-conventions.md sections 3 and 8 (D2, D3, D4, D9, D10, D15),
-- 01 (helpers, trigger), 05 (constraints, hats_guard), 08 (event types), 09 (app_logs).
-- Notes and deviations: supabase/seed-notes.md.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.workshops (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 80),
  city          text check (city is null or char_length(city) <= 80),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  show_prices   boolean not null default false,
  created_at    timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  workshop_id uuid references public.workshops (id),
  name        text check (name is null or char_length(name) <= 80),
  role        text not null default 'member' check (role in ('member', 'admin')),
  created_at  timestamptz not null default now()
);

create table public.weavers (
  id            uuid primary key default gen_random_uuid(),
  workshop_id   uuid not null references public.workshops (id),
  name          text not null check (char_length(name) between 1 and 80),
  village       text check (village is null or char_length(village) <= 80),
  province      text check (province is null or province in ('Azuay', 'Cañar', 'Manabí', 'Other')),
  specialty     text[] not null default '{}',
  weaving_since int check (weaving_since is null or weaving_since between 1900 and 2100),
  bio           text check (bio is null or char_length(bio) <= 200),
  show_name     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.hats (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  workshop_id        uuid not null references public.workshops (id),
  weaver_id          uuid references public.weavers (id),
  grade              text not null,
  rows_per_inch      int not null,
  straw              text default 'Natural',
  size_cm            int,
  price_usd          numeric(10, 2),
  stage              smallint not null default 0,
  owner_type         text not null default 'workshop',
  owner_user_id      uuid references auth.users (id),
  transfer_email     text check (transfer_email is null or char_length(transfer_email) <= 254),
  archived           boolean not null default false,
  version            int not null default 1,
  weaving_started_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Spec 05 constraints. Grade vs rows is NOT a constraint (D10): legacy or imported
  -- records can be wrong, and the grade_mismatch flag exists for exactly that.
  constraint hats_code_format  check (code ~ '^TQ-[A-Z0-9]{5}$'),
  constraint hats_stage_range  check (stage between 0 and 4),
  constraint hats_rows_range   check (rows_per_inch between 6 and 40),
  constraint hats_grade_enum   check (grade in ('Standard', 'Fino', 'Superfino')),
  constraint hats_owner_enum   check (owner_type in ('workshop', 'seller', 'buyer')),
  constraint hats_owner_user   check (owner_type <> 'workshop' or owner_user_id is null),
  constraint hats_size_range   check (size_cm is null or size_cm between 52 and 64),
  constraint hats_price_nonneg check (price_usd is null or price_usd >= 0),
  constraint hats_straw_enum   check (straw is null or straw in ('Natural', 'Bleached', 'Dyed')),
  constraint hats_version_pos  check (version >= 1)
);

create table public.hat_events (
  id         uuid primary key default gen_random_uuid(),
  hat_id     uuid not null references public.hats (id),
  type       text not null check (type in ('created', 'stage_advanced', 'flag_raised', 'flag_reviewed',
                                           'edited', 'transferred', 'claimed', 'archived')),   -- D2
  from_stage smallint check (from_stage is null or from_stage between 0 and 4),
  to_stage   smallint check (to_stage is null or to_stage between 0 and 4),
  actor_id   uuid references public.profiles (id),
  source     text not null default 'manual' check (source in ('ai_proposal', 'manual')),
  note       text check (note is null or char_length(note) <= 500),
  run_id     uuid,              -- FK to agent_runs added below (table defined later)
  created_at timestamptz not null default now(),
  constraint hat_events_one_step check (type <> 'stage_advanced' or to_stage = from_stage + 1)
);

create table public.hat_flags (
  id            uuid primary key default gen_random_uuid(),
  hat_id        uuid not null references public.hats (id),
  kind          text not null check (kind in ('grade_mismatch', 'too_fast', 'weaver_not_found', 'other')),
  message       text not null check (char_length(message) between 1 and 200),
  raised_by     text not null check (raised_by in ('assistant', 'system')),
  reviewed_by   uuid references public.profiles (id),
  review_reason text check (review_reason is null or char_length(review_reason) <= 300),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);

create table public.agent_runs (
  id          uuid primary key default gen_random_uuid(),
  agent       text not null check (agent in ('workshop', 'concierge')),
  user_id     uuid references public.profiles (id),
  workshop_id uuid references public.workshops (id),
  hat_code    text,
  input       text,
  input_mode  text check (input_mode is null or input_mode in ('voice', 'typed')),
  -- D3: workshop running/proposed/failed/stopped, concierge answered/refused/failed.
  status      text not null default 'running'
              check (status in ('running', 'proposed', 'failed', 'stopped', 'answered', 'refused')),
  steps       jsonb not null default '[]'::jsonb,
  summary     text,
  model       text,
  tokens_in   int,
  tokens_out  int,
  latency_ms  int,
  cost_usd    numeric(12, 6),
  request_id  text,
  error       jsonb,
  created_at  timestamptz not null default now()
);

create table public.proposals (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.agent_runs (id),
  workshop_id uuid not null references public.workshops (id),
  type        text not null check (type in ('create_hat', 'advance_stage', 'flag_issue')),
  payload     jsonb not null default '{}'::jsonb,
  edits       jsonb,                                   -- D4: AI payload is never overwritten
  status      text not null default 'pending'
              check (status in ('pending', 'question', 'blocked', 'approved', 'rejected', 'dismissed', 'failed')),
  why         text,
  quote       text,
  confidence  text check (confidence is null or confidence in ('high', 'check')),
  rule_result jsonb,
  edited      boolean not null default false,
  decided_by  uuid references public.profiles (id),
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.hat_events
  add constraint hat_events_run_fk foreign key (run_id) references public.agent_runs (id);

-- Spec 09: no FKs and no format checks beyond sizes, so one bad value never fails a batch.
create table public.app_logs (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  level       text not null check (level in ('debug', 'info', 'warn', 'error')),
  source      text not null check (source in ('web', 'edge:workshop-agent', 'edge:apply-proposals',
                                              'edge:concierge', 'db')),
  action      text not null check (char_length(action) <= 64),
  message     text check (char_length(message) <= 2000),
  user_id     uuid,
  workshop_id uuid,
  request_id  text check (char_length(request_id) <= 40),
  hat_code    text check (char_length(hat_code) <= 16),
  run_id      uuid,
  duration_ms integer,
  payload     jsonb not null default '{}'::jsonb,
  error       jsonb,
  constraint app_logs_payload_size check (pg_column_size(payload) <= 32768)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index profiles_workshop_idx    on public.profiles (workshop_id);
create index weavers_workshop_idx     on public.weavers (workshop_id);
create index hats_workshop_idx        on public.hats (workshop_id, stage);
create index hats_weaver_idx          on public.hats (weaver_id);
-- hats.code already has a unique index (hats_code_key).
create index hat_events_hat_idx       on public.hat_events (hat_id, created_at);
create index hat_events_run_idx       on public.hat_events (run_id) where run_id is not null;
create index hat_flags_hat_idx        on public.hat_flags (hat_id);
create index hat_flags_open_idx       on public.hat_flags (hat_id) where reviewed_at is null;
create index agent_runs_created_idx   on public.agent_runs (created_at desc);
create index agent_runs_user_idx      on public.agent_runs (user_id, created_at desc);
create index agent_runs_request_idx   on public.agent_runs (request_id);
create index agent_runs_workshop_idx  on public.agent_runs (workshop_id, created_at desc);
create index proposals_run_idx        on public.proposals (run_id);
create index proposals_status_idx     on public.proposals (workshop_id, status, created_at desc);
create index app_logs_created_idx     on public.app_logs (created_at desc);
create index app_logs_request_idx     on public.app_logs (request_id);
create index app_logs_level_idx       on public.app_logs (level, created_at desc);
create index app_logs_action_idx      on public.app_logs (action, created_at desc);
create index app_logs_run_idx         on public.app_logs (run_id) where run_id is not null;
create index app_logs_hat_idx         on public.app_logs (hat_code) where hat_code is not null;
create index app_logs_concierge_ip_idx on public.app_logs ((payload ->> 'ip_hash'), created_at)
  where action in ('concierge.message', 'concierge.refused');

-- ---------------------------------------------------------------------------
-- Rule helpers
-- ---------------------------------------------------------------------------

-- Mirrors GRADE_RANGES in supabase/functions/_shared/domain.ts.
create or replace function public.grade_for_rows(r int) returns text
language sql immutable set search_path = public as $$
  select case when r between 8 and 14 then 'Standard'
              when r between 15 and 24 then 'Fino'
              when r between 25 and 40 then 'Superfino' end
$$;

-- ---------------------------------------------------------------------------
-- hats_guard: one place every writer passes through (D9)
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

  -- UPDATE
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

create trigger hats_guard before insert or update on public.hats
  for each row execute function public.hats_guard();

-- ---------------------------------------------------------------------------
-- hat_events: append-only for everyone
-- ---------------------------------------------------------------------------

-- The only exception: the service-role function seed_backfill_actors() fills a NULL actor_id on
-- seeded history (users are created after the seed migration). It sets a transaction-local flag.
-- Nothing else in a row may change, and deletes are never allowed.
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
  raise exception 'hat_events is append-only' using errcode = 'insufficient_privilege';
end $$;

create trigger hat_events_no_change before update or delete on public.hat_events
  for each row execute function public.hat_events_append_only();

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so policies don't recurse into profiles RLS)
-- ---------------------------------------------------------------------------

create or replace function public.my_workshop_id() returns uuid
language sql stable security definer set search_path = public as $$
  select workshop_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

-- ---------------------------------------------------------------------------
-- New auth user -> profile (always member), plus a workshop when sign-up metadata has one
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ws   uuid;
  v_name text := nullif(trim(new.raw_user_meta_data ->> 'workshop_name'), '');
  v_city text := nullif(trim(new.raw_user_meta_data ->> 'city'), '');
begin
  if v_name is not null then
    insert into public.workshops (name, city, contact_email)
    values (left(v_name, 80), left(coalesce(v_city, 'Other'), 80), new.email)
    returning id into v_ws;
  end if;

  insert into public.profiles (id, workshop_id, name, role)
  values (new.id, v_ws,
          left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)), 80),
          'member')            -- metadata can never choose a role
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
