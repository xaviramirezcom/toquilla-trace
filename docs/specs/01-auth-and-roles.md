# 01. Auth and roles

## 1. Summary

Email and password login with Supabase Auth. Signing up creates a workshop and a `member` profile in one database trigger. Two roles (`member`, `admin`) are enforced by row-level security (RLS) on every table, not by hidden links.

Serves: **works end to end** (login is the entry point), **real application logic** (RLS, trigger, return URL), **judicious AI use** (least privilege for people: members never see logs, traces or costs), **code you can explain** (one SQL file, one middleware).

## 2. Scope

| Item | Must/Nice/Cut | Why |
|---|---|---|
| Sign up (name, workshop, city, email, password, terms) | Must | Graders need to create an account |
| Trigger: new auth user creates workshop + profile (`member`) | Must | No orphan users, no client-side race |
| Log in / log out | Must | Core |
| Middleware protecting app routes + return URL (`?next=`) | Must | Session handling, deep links from passport "Log in to claim" |
| RLS policies for all 9 tables + helper functions | Must | Security boundary, listed in conventions |
| Admin made by SQL in `seed.sql` (never self-service) | Must | Least privilege |
| Admin guard on `/runs`, `/logs` + "is for admins" card | Must | Revision 2 roles |
| `public_hat_passport(code)` function (signature + grants) | Must | Anonymous passport without raw table access. Body detail owned by the passport spec |
| Auth error states and copy (inline + banners) | Must | Product taste, cheap |
| Auth logging (`auth.signup`, `auth.login`, `auth.login_failed`, `auth.logout`) | Must | Observability |
| Admin badge in user menu, Admin sidebar group | Must | Visible role difference for the demo |
| Logout confirm when proposals are pending | Nice | One count query |
| Session expired dialog | Nice | Middleware redirect already covers it |
| Show/hide password eye toggle | Nice | 3 minutes |
| Forgot password / reset | Cut | Conventions cut list |
| Settings (change password, delete account) | Cut | Conventions cut list |
| Email confirmation | Cut | Turned off in Supabase so the demo works instantly |
| Inviting more members to a workshop | Cut | One member per workshop for now |

## 3. User stories

**Visitor**
- As a visitor, I can create a workshop account and land in my Workshop in its first-run state.
- As a visitor who clicked "Log in to claim this hat" on a passport, I return to that passport after logging in.

**Member**
- As a member, I can log in, see only my workshop's hats, weavers and proposals, and log out.
- As a member, if I open `/runs` or `/logs`, I see "Agent runs is for admins" (or "Logs is for admins") with **Go to Workshop**, and no data loads.
- As a member, I can never change my own role or my workshop.

**Admin**
- As an admin (Toquilla Trace staff), I see the Admin group (Agent runs, Logs) and a blue **Admin** badge, and I can read rows from every workshop.
- As an admin, I am made only by a SQL statement run by the developer.

## 4. UI

### Routes

| Route | Access | Notes |
|---|---|---|
| `/login`, `/signup` | Public. Logged-in users are redirected to `/workshop` (or `next`) | Auth card, Newsreader title |
| `/workshop`, `/hats/**`, `/weavers`, `/settings` | Logged in | Middleware redirects to `/login?next=<path>` |
| `/runs/**`, `/logs` | Logged in. Admin to see data | Members get the admins-only card |
| `/`, `/hat/[code]` | Public | No redirect |

### Components

- `components/auth/LoginForm.tsx`, `SignupForm.tsx` (client components calling server actions).
- `components/auth/AdminOnly.tsx`: centered card (handoff "Agent runs", last paragraph): shield icon, "{Agent runs|Logs} is for admins", "This page shows technical details from every workshop, so only Toquilla Trace admins can open it. If something isn't working, share the reference from the error message with support.", button **Go to Workshop**.
- `components/shell/UserMenu.tsx`: name, email, workshop, **Admin** badge (info blue) for admins, **Admin tools** (mobile, admins only), **Log out**.
- `components/shell/Sidebar.tsx`: Admin group rendered only when `profile.role === 'admin'`.

### Log in (handoff "Landing and auth", "Log in")

- Title "Welcome back". Email placeholder "you@workshop.com". Password with eye toggle (aria-label "Show password" / "Hide password").
- **Forgot password?** link: Cut (conventions). Hidden in the build; listed as a next step in HANDOFF.
- Button **Log in**, loading label "Logging in...". On mobile the button sits in the bottom bar.
- Inline errors (on submit, then on change): "Enter your email." / "That doesn't look like an email." / "Enter your password."
- Banners:

| Case | Copy | Behaviour |
|---|---|---|
| Wrong credentials | "Email or password is incorrect." | Password field cleared, focus password |
| Rate limited | "Too many attempts. Try again in 1 minute." | Button disabled 60 s |
| Network | "Couldn't reach the server. Check your connection and try again." | **Retry** resubmits |

### Sign up (handoff "Sign up")

- Title "Create your workshop account".
- Fields: Your name, Workshop name (placeholder "Taller Pillco"), City select (Cuenca, Montecristi, Sígsig, Pile, Other), Email, Password (hint "At least 8 characters" turns into a green check when met), required checkbox "I agree to the terms".
- Existing email: "This email already has an account. **Log in instead?**" (link to `/login?email=...` is not used; plain `/login`, never put the email in the URL).
- **Create account**, loading "Creating account...". Success: redirect to `/workshop`, toast "Welcome to Toquilla Trace!", first-run state (owned by the workshop spec).

### Loading, empty, error

- Auth forms: button loading state only (keep width, spinner).
- Admin pages: the role check happens on the server before render, so no flash of admin content.
- Unexpected server error on auth: network banner copy (above), and `auth.login_failed` logged with `reason: "unknown"`.

### Mobile vs desktop

- Mobile: single column card, primary button in a 48 to 52px bottom bar.
- Desktop: centered 420px card.
- Admin links: desktop sidebar Admin group; mobile user menu under **Admin tools**, never the tab bar.

## 5. Data

Tables used: all nine from conventions section 3. This spec owns `supabase/migrations/0001_init.sql` sections "helpers", "auth trigger" and "RLS".

### 5.1 Helper functions

```sql
-- Security definer so policies on other tables do not recurse into profiles RLS.
create or replace function public.my_workshop_id() returns uuid
language sql stable security definer set search_path = public as $$
  select workshop_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

revoke all on function public.my_workshop_id(), public.is_admin() from public, anon;
grant execute on function public.my_workshop_id(), public.is_admin() to authenticated;
```

### 5.2 Sign-up trigger

The browser calls `supabase.auth.signUp({ email, password, options: { data: { name, workshop_name, city } } })`. The trigger reads that metadata.

```sql
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare ws_id uuid;
begin
  insert into public.workshops (name, city, contact_email)
  values (
    coalesce(nullif(trim(new.raw_user_meta_data->>'workshop_name'), ''), 'My workshop'),
    coalesce(nullif(trim(new.raw_user_meta_data->>'city'), ''), 'Other'),
    new.email)
  returning id into ws_id;

  insert into public.profiles (id, workshop_id, name, role)
  values (
    new.id, ws_id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)),
    'member');           -- always member, metadata cannot choose a role
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

Notes:
- The trigger ignores any `role` in metadata. Role is hard-coded `member`.
- If the trigger fails, Supabase rolls back the user insert, so there are no orphan users.
- Workshop name is trimmed and capped at 80 chars by a check constraint on `workshops.name` (`char_length(name) between 1 and 80`).

### 5.3 Making an admin (seed only)

```sql
-- supabase/seed.sql (run by the developer, service role). Never exposed in the UI.
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'admin@toquillatrace.dev');
```

The seed creates two users through the Supabase Admin API script or the dashboard: `xavier@tallerpillco.com` (member, Taller Pillco) and `admin@toquillatrace.dev` (admin, attached to a "Toquilla Trace HQ" workshop). Passwords live only in the developer's local notes and the README "Demo accounts" section for graders, never in git (see Open questions).

### 5.4 Column privileges (role is never updatable by users)

```sql
revoke update on public.profiles from authenticated, anon;
grant update (name) on public.profiles to authenticated;

revoke update on public.workshops from authenticated, anon;
grant update (name, city, contact_email, show_prices) on public.workshops to authenticated;

revoke update on public.hat_flags from authenticated, anon;
grant update (reviewed_by, review_reason, reviewed_at) on public.hat_flags to authenticated;

revoke update (id, code, workshop_id, created_at) on public.hats from authenticated;
```

Even a crafted `update profiles set role='admin'` from the browser fails with "permission denied for column role".

### 5.5 RLS policies (every table)

```sql
alter table public.workshops  enable row level security;
alter table public.profiles   enable row level security;
alter table public.weavers    enable row level security;
alter table public.hats       enable row level security;
alter table public.hat_events enable row level security;
alter table public.hat_flags  enable row level security;
alter table public.agent_runs enable row level security;
alter table public.proposals  enable row level security;
alter table public.app_logs   enable row level security;

-- workshops: own or admin read; own update. Insert only via trigger. No delete.
create policy ws_select on public.workshops for select to authenticated
  using (id = my_workshop_id() or is_admin());
create policy ws_update on public.workshops for update to authenticated
  using (id = my_workshop_id()) with check (id = my_workshop_id());

-- profiles: self, same workshop, or admin read; self update (name only by grant).
create policy pr_select on public.profiles for select to authenticated
  using (id = auth.uid() or workshop_id = my_workshop_id() or is_admin());
create policy pr_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- weavers: own workshop read/insert/update, admin read. No delete (Remove is Cut).
create policy wv_select on public.weavers for select to authenticated
  using (workshop_id = my_workshop_id() or is_admin());
create policy wv_insert on public.weavers for insert to authenticated
  with check (workshop_id = my_workshop_id());
create policy wv_update on public.weavers for update to authenticated
  using (workshop_id = my_workshop_id()) with check (workshop_id = my_workshop_id());

-- hats: own workshop read, admin read. Insert into own workshop.
-- Update only while the workshop still owns it and it has not been transferred.
create policy hat_select on public.hats for select to authenticated
  using (workshop_id = my_workshop_id() or is_admin());
create policy hat_insert on public.hats for insert to authenticated
  with check (workshop_id = my_workshop_id() and owner_type = 'workshop');
create policy hat_update on public.hats for update to authenticated
  using (workshop_id = my_workshop_id() and owner_type = 'workshop' and transfer_email is null)
  with check (workshop_id = my_workshop_id());

-- hat_events: append-only. Read via hat; insert own actor on own hats. No update/delete policy.
create policy ev_select on public.hat_events for select to authenticated
  using (exists (select 1 from public.hats h where h.id = hat_id
                 and (h.workshop_id = my_workshop_id() or is_admin())));
create policy ev_insert on public.hat_events for insert to authenticated
  with check (actor_id = auth.uid()
              and exists (select 1 from public.hats h where h.id = hat_id
                          and h.workshop_id = my_workshop_id()));

-- hat_flags: read via hat. No member insert (assistant and system flags come from the service role).
-- Members may update only the review columns (grant above), once.
create policy fl_select on public.hat_flags for select to authenticated
  using (exists (select 1 from public.hats h where h.id = hat_id
                 and (h.workshop_id = my_workshop_id() or is_admin())));
create policy fl_update on public.hat_flags for update to authenticated
  using (reviewed_at is null and exists (select 1 from public.hats h where h.id = hat_id
                                         and h.workshop_id = my_workshop_id()))
  with check (reviewed_by = auth.uid());

-- agent_runs: admin read only. Users insert their own rows. Edge functions use service role.
create policy run_select on public.agent_runs for select to authenticated using (is_admin());
create policy run_insert on public.agent_runs for insert to authenticated
  with check (user_id = auth.uid());

-- proposals: own workshop or admin read. Writes only via edge functions (service role).
create policy prop_select on public.proposals for select to authenticated
  using (workshop_id = my_workshop_id() or is_admin());

-- app_logs: admin read only. Users insert their own rows only.
create policy log_select on public.app_logs for select to authenticated using (is_admin());
create policy log_insert on public.app_logs for insert to authenticated
  with check (user_id = auth.uid()
              and (workshop_id is null or workshop_id = my_workshop_id()));
```

No policy is granted to `anon` on any table. Anonymous access goes only through `public_hat_passport`.

### 5.6 `public_hat_passport(code)`

```sql
create or replace function public.public_hat_passport(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if p_code !~ '^TQ-[A-Z0-9]{5}$' then return null; end if;
  return (
    select jsonb_build_object(
      'code', h.code, 'grade', h.grade, 'rows_per_inch', h.rows_per_inch,
      'straw', h.straw, 'size_cm', h.size_cm,
      'price_usd', case when w.show_prices then h.price_usd end,
      'stage', h.stage, 'archived', h.archived, 'owner_type', h.owner_type,
      'workshop', jsonb_build_object('name', w.name, 'city', w.city, 'contact_email', w.contact_email),
      'weaver', jsonb_build_object(
          'name', case when wv.show_name then wv.name end,
          'village', wv.village, 'province', wv.province,
          'weaving_since', wv.weaving_since, 'bio', wv.bio),
      'events', (select coalesce(jsonb_agg(jsonb_build_object(
          'type', e.type, 'to_stage', e.to_stage, 'created_at', e.created_at)
          order by e.created_at), '[]') from hat_events e where e.hat_id = h.id),
      'viewer_is_transferee', (h.transfer_email is not null
          and lower(h.transfer_email) = lower(coalesce(auth.jwt()->>'email', ''))),
      'viewer_is_owner', (h.owner_user_id is not null and h.owner_user_id = auth.uid()))
    from hats h join workshops w on w.id = h.workshop_id
    left join weavers wv on wv.id = h.weaver_id
    where h.code = p_code);
end $$;

revoke all on function public.public_hat_passport(text) from public;
grant execute on function public.public_hat_passport(text) to anon, authenticated;
```

Never returned: `transfer_email`, `owner_user_id`, actor ids, notes, flags, workshop id. Exact field list may be extended by the passport spec, under the same "no personal data" rule.

## 6. Server logic and API

Libraries: `@supabase/ssr` with `createServerClient` (cookies) in `lib/supabase/server.ts`, `createBrowserClient` in `lib/supabase/client.ts`.

### 6.1 Middleware (`middleware.ts`)

```ts
const PROTECTED = ["/workshop", "/hats", "/weavers", "/runs", "/logs", "/settings"];
const AUTH_PAGES = ["/login", "/signup"];

export async function middleware(req: NextRequest) {
  const { res, user } = await updateSession(req); // refreshes cookies, returns getUser()
  const path = req.nextUrl.pathname;
  if (!user && PROTECTED.some(p => path === p || path.startsWith(p + "/"))) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", path + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  if (user && AUTH_PAGES.includes(path)) {
    return NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get("next")), req.url));
  }
  return res;
}
export const config = { matcher: ["/((?!_next|favicon|api/health|.*\\.(?:svg|png|ico)).*)"] };
```

`safeNext(next)` (in `lib/auth/next.ts`, pure, tested): returns `next` only if it starts with `/`, does not start with `//` or `/\`, and has no `://`; otherwise `/workshop`.

Use `supabase.auth.getUser()` (verifies with Supabase), never `getSession()` alone, for decisions.

### 6.2 Server actions (`app/(auth)/actions.ts`)

```ts
type AuthResult = { ok: true; redirectTo: string } | { ok: false; code: AuthErrorCode };
type AuthErrorCode = "invalid_credentials" | "rate_limited" | "network" | "email_taken"
                   | "weak_password" | "invalid_input" | "unknown";

export async function login(form: { email: string; password: string; next?: string }): Promise<AuthResult>
export async function signup(form: { name: string; workshopName: string; city: City;
  email: string; password: string; agreed: boolean }): Promise<AuthResult>
export async function logout(): Promise<void>
```

**login algorithm**
1. `validateLogin(form)` (pure). Invalid: return `invalid_input` (client already shows inline errors).
2. `newRequestId()`; `t0 = Date.now()`.
3. `supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })`.
4. On error, `code = mapAuthError(error)`, log `auth.login_failed` (warn) through the `log_public()` RPC (anon allowed, allowlisted actions; see D6), return `{ ok:false, code }`.
5. On success, log `auth.login` (info) with the new session, return `{ ok:true, redirectTo: safeNext(next) }`.

**signup algorithm**
1. `validateSignup(form)`: name 1..60, workshopName 1..80, city in list, email regex, password >= 8, agreed true.
2. `supabase.auth.signUp({ email, password, options: { data: { name, workshop_name, city } } })`. Email confirmation is off, so a session is returned.
3. Error: map (`user_already_exists` or message "User already registered" -> `email_taken`; `weak_password` -> `weak_password`), then log `auth.signup` with level `warn` and `payload.ok=false` (through `log_public()`, no session yet; see D6).
4. Success: log `auth.signup` (info), redirect `/workshop?welcome=1` (shows the toast once).

**logout**: log `auth.logout` first (session still valid), then `supabase.auth.signOut()`, redirect `/`.

**mapAuthError** (pure, tested):

| Supabase error | Code |
|---|---|
| `code === "invalid_credentials"` or status 400 with "Invalid login credentials" | `invalid_credentials` |
| status 429 or `code === "over_request_rate_limit"` | `rate_limited` |
| `code === "user_already_exists"` or "User already registered" | `email_taken` |
| `code === "weak_password"` | `weak_password` |
| `TypeError` / fetch failed / status 0 | `network` |
| anything else | `unknown` |

### 6.3 Admin guard

`lib/auth/getProfile.ts`: `getProfile()` returns `{ id, name, email, role, workshop: { id, name, city } } | null` (server only, cached per request with React `cache`).

`app/runs/layout.tsx` and `app/logs/layout.tsx`:
```tsx
const p = await getProfile();            // middleware guaranteed a user
if (p?.role !== "admin") return <AdminOnly page="Agent runs" />;   // or "Logs"
return children;
```
The data queries under these pages also return empty for members because of RLS (`is_admin()`), so the guard is UX and RLS is the boundary. Any route handler under `/api/runs` or `/api/logs` returns `403 { error: { code: "forbidden", ... } }` for non-admins.

## 7. Business rules and edge cases

1. A new sign-up always gets `role = 'member'`, even if metadata contains `role: "admin"`.
2. A new sign-up gets exactly one new workshop with the given name and city, and `contact_email = email`.
3. A member updating `profiles.role` gets a permission error; the row is unchanged.
4. A member updating `profiles.workshop_id` gets a permission error.
5. A member selecting `hats` sees only rows with their `workshop_id`.
6. An admin selecting `hats` sees rows from all workshops.
7. A member selecting `app_logs` or `agent_runs` gets 0 rows (no error).
8. `anon` selecting any table gets 0 rows; `public_hat_passport('TQ-9A1M8')` returns the passport.
9. `public_hat_passport('bad')` and an unknown code return `null`.
10. The passport JSON never contains `transfer_email` or `owner_user_id`.
11. `hat_events` rows cannot be updated or deleted by any authenticated user.
12. `next=//evil.com` or `next=https://evil.com` redirects to `/workshop`.
13. Unauthenticated `/hats/TQ-7F3K2` redirects to `/login?next=%2Fhats%2FTQ-7F3K2`; after login the user lands on that hat.
14. A logged-in user opening `/login` is redirected to `/workshop`.
15. Wrong password clears the password field and shows "Email or password is incorrect."
16. Signing up with an existing email shows "This email already has an account. Log in instead?"
17. Password of 7 chars blocks submit; 8 chars passes.
18. Member opening `/runs` sees the admins-only card and no runs request returns data.
19. A member inserting an `app_logs` row with another `user_id` is rejected.
20. A flag can be reviewed once: updating an already reviewed flag affects 0 rows.

## 8. Logging

All rows: `source: "web"`, `request_id` from `newRequestId()`. Never log passwords, tokens or JWTs.

| Action | Level | When | user_id / workshop_id | payload |
|---|---|---|---|---|
| `auth.signup` | info (warn on failure) | after `signUp` | new user id / new workshop id (null on failure) | `{ ok, city, error_code? }` |
| `auth.login` | info | after successful sign-in | user / workshop | `{ next }` |
| `auth.login_failed` | warn | failed sign-in | null | `{ error_code, email_domain, email_hash }` (`email_hash` = first 12 hex of SHA-256 of the lowercased email, so repeated failures can be grouped without storing the address) |
| `auth.logout` | info | before `signOut` | user / workshop | `{}` |

`duration_ms` is set on login and signup (Supabase round trip). `auth.login_failed` and failed `auth.signup` are written through the `log_public()` RPC (see D6 in 00-conventions). The service role key is never on Vercel.

## 9. Security and privacy

- RLS on all 9 tables; no `anon` policies; anon reads only through one security definer function with a fixed output.
- Security definer functions set `search_path = public` and are granted explicitly.
- Role is not updatable by users (column grants), and the trigger hard-codes `member`.
- Admins have read-only power in the app. Their writes are limited to what members can do in their own workshop (least privilege; admins debug, they do not edit workshops' data).
- Service role key is used only in Edge Functions (never on Vercel).
- `next` is sanitized against open redirects. Emails are never put in URLs.
- Cookies are httpOnly, managed by `@supabase/ssr`.
- Supabase built-in rate limiting covers login brute force; we surface it with "Too many attempts".

## 10. Tests

**Unit (Vitest, `tests/auth.test.ts`)**

| Function | Input | Expected |
|---|---|---|
| `safeNext` | `"/hats/TQ-7F3K2"` | `"/hats/TQ-7F3K2"` |
| `safeNext` | `"//evil.com"` | `"/workshop"` |
| `safeNext` | `"https://evil.com"` | `"/workshop"` |
| `safeNext` | `null` | `"/workshop"` |
| `safeNext` | `"/\\evil.com"` | `"/workshop"` |
| `validateLogin` | `{email:"", password:"x"}` | `{ email: "Enter your email." }` |
| `validateLogin` | `{email:"abc", password:"x"}` | `{ email: "That doesn't look like an email." }` |
| `validateLogin` | `{email:"a@b.co", password:""}` | `{ password: "Enter your password." }` |
| `validateSignup` | password `"1234567"` | error on `password` |
| `validateSignup` | `agreed:false` | error on `agreed` |
| `mapAuthError` | `{status:400, code:"invalid_credentials"}` | `"invalid_credentials"` |
| `mapAuthError` | `{status:429}` | `"rate_limited"` |
| `mapAuthError` | `{code:"user_already_exists"}` | `"email_taken"` |
| `mapAuthError` | `new TypeError("fetch failed")` | `"network"` |
| `authErrorCopy` | `"rate_limited"` | `"Too many attempts. Try again in 1 minute."` |

**Integration (SQL script `tests/rls.sql`, run against local Supabase with `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>"}'`)**
- Member A: `select count(*) from hats` equals count of hats in workshop A.
- Member A: `update profiles set role='admin' where id=auth.uid()` raises `permission denied`.
- Member A: `select count(*) from app_logs` = 0. Admin: > 0.
- `anon`: `select public_hat_passport('TQ-9A1M8') ? 'transfer_email'` is false.
- Member A: `delete from hat_events` affects 0 rows.
- Insert into `auth.users` via `supabase.auth.admin.createUser` with metadata, then check one workshop and one `member` profile exist.

## 11. Acceptance criteria

- [ ] On the live link, sign up as a new workshop, land in `/workshop` with "Welcome to Toquilla Trace!".
- [ ] Log out, log in with the same account, land in `/workshop`.
- [ ] Wrong password shows "Email or password is incorrect." and clears the password.
- [ ] Opening `/hats` logged out redirects to `/login?next=%2Fhats`, and after login lands on `/hats`.
- [ ] The new workshop sees no hats from Taller Pillco.
- [ ] As the seeded member, `/logs` shows "Logs is for admins" and **Go to Workshop** works.
- [ ] As the seeded admin, the sidebar shows Admin > Agent runs, Logs, and the user menu shows the Admin badge.
- [ ] As admin, Logs shows `auth.login`, `auth.login_failed` and `auth.signup` rows from the steps above.
- [ ] Logged out, `/hat/TQ-9A1M8` renders (passport function works for anon).
- [ ] In the browser console as a member, `supabase.from('profiles').update({role:'admin'})` returns an error.

## 12. Build plan

Share of 2 hours: **25 minutes** (project scaffold and first Vercel deploy are counted in the overall plan, not here).

| # | Task | Min |
|---|---|---|
| 1 | Supabase project settings: email confirm off, site URL + Vercel URL in redirect list | 2 |
| 2 | Migration: helpers, trigger, column grants, RLS for 9 tables, passport function | 8 |
| 3 | `lib/supabase/*`, `middleware.ts`, `safeNext` + tests | 4 |
| 4 | Login and signup forms + server actions + `mapAuthError` + tests | 6 |
| 5 | `getProfile`, user menu (Admin badge, Log out), AdminOnly card + layouts | 3 |
| 6 | Seed users and admin SQL, smoke test on deploy | 2 |
| | **Total** | **25** |

## 13. Interview talking points

- **Trigger, not client code, creates the workshop:** atomic with the auth user, no race, no way for a client to pick a role.
- **`my_workshop_id()` / `is_admin()` as security definer:** avoids RLS recursion on `profiles` and keeps every policy one readable line.
- **Column grants for role:** RLS controls rows, grants control columns. Both are needed to make "role is never self-service" true.
- **Admin page guard is UX; RLS is the boundary:** a member calling the API directly still gets 0 rows.
- **Passport as a function with a fixed JSON shape:** the anon key can read only what we chose, which is least privilege for the public.
- **Login failures logged with a hashed email:** debuggable (group attempts) without storing who tried.
- **Extending in 45 minutes:** invite members to a workshop (`workshop_invites` table + accept flow, trigger joins existing workshop), password reset (`resetPasswordForEmail` + `/auth/callback`), an `owner` vs `staff` role inside a workshop (one more check value and policy clause), SSO via Supabase OAuth providers.

## 14. Open questions

1. **Admin's workshop:** conventions require `profiles.workshop_id`, so the admin gets a "Toquilla Trace HQ" workshop. Alternative: make `workshop_id` nullable for admins. Spec assumes the HQ workshop.
2. **Demo passwords:** graders need demo accounts. Proposal: list them in the README (not in git-tracked seed SQL) and create users via a local script using the service role. Confirm this is acceptable under "no secrets in git".
3. **Anonymous logging (`passport.view`, `auth.login_failed`):** resolved by D6 in 00-conventions: a `log_public()` security definer RPC with an allowlist of actions. No service role key on Vercel.
4. **Hats update policy blocks edits after transfer** (`transfer_email is null`). The handoff says "You won't be able to change this hat after transferring it." Archive after transfer is therefore also blocked. Confirm.
5. **Admin writes:** conventions say admins "read everything" but are silent on writes. Spec gives admins no cross-workshop write access.
6. **No `hat_flags` insert for members.** Spec 08 blocks grade mismatches on manual create instead of flagging them, so members never need to insert flags. If a later spec wants manual flags, add an insert policy limited to own hats.
