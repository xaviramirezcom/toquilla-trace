-- Security review fixes S1 and S2 (docs/SECURITY.md).
--
-- S1: members kept UPDATE on the descriptive hat columns (weaver_id, grade, rows_per_inch, straw,
--     size_cm, price_usd) for a future "Edit details" form that was never built. That let a member
--     change a public grade with no hat_event and no grade/rows check, or point a hat at another
--     workshop's weaver. No client code writes hats directly (every write goes through the definer
--     RPCs create_hat, advance_hat, transfer_hat, archive_hat, claim_hat, or apply_proposal from the
--     Edge Function), so the grant is removed entirely. create_hat and apply_proposal already check
--     that the weaver belongs to the caller's (or the proposal's) workshop.
--     The insert/update policies that no grant can reach any more are dropped so the policy list
--     matches what is actually allowed.
--
-- S2: the sign-up trigger copied the member's login email into workshops.contact_email, which the
--     public passport shows to anyone. New workshops now start with no contact email (the passport
--     hides the contact link when it is null). Workshops created by sign-up before this migration
--     have their contact email cleared when it is still the owner's login email. Seeded workshop
--     addresses (Taller Pillco, HQ, Eval) are public workshop addresses and are not touched.

revoke update on public.hats from authenticated;
drop policy if exists hat_update on public.hats;
drop policy if exists hat_insert on public.hats;       -- insert revoked in migration 6
drop policy if exists ev_insert on public.hat_events;  -- insert revoked in migration 6

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ws   uuid;
  v_name text := nullif(trim(new.raw_user_meta_data ->> 'workshop_name'), '');
  v_city text := nullif(trim(new.raw_user_meta_data ->> 'city'), '');
begin
  if v_name is not null then
    -- contact_email stays null: the login email is private and is never published.
    insert into public.workshops (name, city)
    values (left(v_name, 80), left(coalesce(v_city, 'Other'), 80))
    returning id into v_ws;
  end if;

  insert into public.profiles (id, workshop_id, name, role)
  values (new.id, v_ws,
          left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)), 80),
          'member')            -- metadata can never choose a role
  on conflict (id) do nothing;
  return new;
end $$;

update public.workshops w
   set contact_email = null
 where w.id not in ('11111111-1111-4111-8111-111111111111',
                    '22222222-2222-4222-8222-222222222222',
                    '33333333-3333-4333-8333-333333333333')
   and w.contact_email is not null
   and exists (select 1
                 from public.profiles p
                 join auth.users u on u.id = p.id
                where p.workshop_id = w.id
                  and lower(u.email) = lower(w.contact_email));
