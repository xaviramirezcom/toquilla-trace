# 06. Public passport and claim

## 1. Summary

`/hat/[code]` is the public, logged-out page a buyer reaches by scanning a tag, following a link or typing a code on the landing page. It shows a Verified certificate, the hat's story built from `hat_events`, specs, the weaver, and an ownership line that changes with who is looking. The transfer recipient can claim the hat in one tap.

Serves: product taste (the "wow" page), privacy (no buyer names, `transfer_email` never leaves the database), least privilege (anonymous reads only through one security definer function), and observability (`passport.view` / `passport.verify_failed` rows).

## 2. Scope

| Item | Must/Nice/Cut | Why |
|---|---|---|
| Route `/hat/[code]`, server rendered, no app shell, works logged out | Must | Core public surface |
| `public_hat_passport(code)` SQL function | Must | Only way anon reads hat data |
| Code normalization, lowercase redirect, Not verified state, Try another code | Must | Typos and fakes are the common case |
| Verified certificate (seal, workshop, finished date, code) | Must | The trust moment |
| Story timeline from `hat_events` | Must | Proves months of handwork |
| Specs strip (rows, grade, straw, size, price if allowed) | Must | Grade check is the value claim |
| Grade "What does this mean?" tooltip | Nice | Cheap, but not blocking |
| Weaver card (name only if `show_name`) | Must | Weaver credit is a core pain point |
| Ownership line per viewer (handoff "Who sees Claim") | Must | Privacy and the claim rule are visible here |
| Archived banner | Must | One line, avoids a confusing state |
| Claim flow (`claim_hat` RPC, dialogs, stamp animation) | Nice | Depends on seeded transfer; build after concierge |
| Share: native share sheet, else copy link | Must | Small, needed on mobile bar |
| Share menu "Show QR" | Cut | QR images are cut in conventions |
| `passport.view` / `passport.verify_failed` logging | Must | Every action is logged |
| `generateMetadata` title, description, Open Graph, Twitter card | Must | Link previews in WhatsApp are how passports travel |
| Dynamic OG image (`opengraph-image.tsx`) | Nice | Static image is enough for v1 |
| Loading skeletons (`loading.tsx`) | Nice | Page is fast; skeleton is polish |
| Report a problem (mailto) | Nice | Footer link only |
| "Under review" note when open flags exist | Nice | Honest signal for flagged hats |
| Landing "Verify a hat" box routes here | Must | Second entry point |

## 3. User stories

- **Buyer in a shop (logged out):** I scan the tag and in under 2 seconds see "VERIFIED AUTHENTIC", who wove it and how long it took, so I can trust the price.
- **Buyer with a mistyped code:** I see a clear "We can't verify this hat" card and can try another code without leaving the page.
- **Transfer recipient (logged in, email matches):** I see "Transferred to you on ..." and a Claim button. One tap registers the hat to me with a stamp.
- **Transfer recipient (logged out):** Claim opens "Log in to claim this hat". After login I land back on the passport.
- **Anyone else logged in:** I see the hat and its story, but no Claim button and no hint of who the buyer is.
- **Workshop member:** I share a passport link in WhatsApp and the preview shows grade, weaver and "Verified".
- **Admin:** I can see in `app_logs` how many passport views and failed verifications happened, with no personal data.

## 4. UI

### Routes and files

```
app/hat/[code]/page.tsx            server component (RSC), dynamic
app/hat/[code]/loading.tsx         skeletons (Nice)
app/hat/[code]/opengraph-image.tsx dynamic OG image (Nice)
components/passport/
  PassportTopBar.tsx   Certificate.tsx  Seal.tsx  NotVerified.tsx  CodeInput.tsx
  SpecsStrip.tsx  GradeTip.tsx  StoryTimeline.tsx  WeaverCard.tsx
  OwnershipCard.tsx  ClaimButton.tsx  ClaimDialog.tsx  ShareButton.tsx
  PassportBottomBar.tsx (mobile)  ArchivedBanner.tsx
lib/passport/
  story.ts       buildStory(passport) -> StoryStep[]   (pure)
  ownership.ts   ownershipView(passport) -> { line, claim }   (pure)
  grade-tip.ts   gradeTip(grade) -> string   (pure)
  meta.ts        passportMeta(passport) -> { title, description }   (pure)
```

No app shell: own 64px top bar (logo links to `/`, right side **Log in** or avatar) and footer ("Powered by Toquilla Trace", **Report a problem**). Copy and layout follow handoff section "Public passport", word for word.

### Page states

| State | When | What renders |
|---|---|---|
| Loading | Route transition | Skeleton certificate + 5 timeline rows (Nice). |
| Verified | RPC returns a record | Certificate, hero, specs, story, weaver, ownership, bottom bar. Concierge FAB / Ask (spec 07). |
| Verified + archived | `archived = true` | Muted banner above everything: "This hat was archived by its workshop. Its record is still valid." Rest unchanged. |
| Verified + open flags (Nice) | `open_flags > 0` | Small warn line under the certificate: "The workshop is reviewing part of this record." (new copy, see Open questions). |
| In production | Found, `stage < 4` | Certificate line 3 reads "In production · {Stage} since {date}" instead of "Finished {date}". Upcoming steps muted. |
| Not verified | Code invalid or not found | Red card "We can't verify this hat" + "The code {CODE} isn't in our records. It may be mistyped, or the hat may not be genuine." Buttons **Try another code**, **Report a problem**. Then "How to spot a real Panama hat" with the 3 tips from the prototype. No concierge, no bottom bar. |
| Error | RPC throws | Handoff "Page error" card with Try again and mono Request ID. Logged as `ui.error`. |

For an invalid code, `{CODE}` shows the normalized text, cut to 12 characters, rendered as plain text.

### Verified layout (handoff "Public passport", items 1 to 6)

1. **Certificate:** 10px woven frame, 96px seal with stamp animation on first paint (600ms, `cubic-bezier(.2,1.3,.4,1)`, off under `prefers-reduced-motion`), "VERIFIED AUTHENTIC", "Recorded by {workshop.name}, {workshop.city}", "Finished {Mon D, YYYY}", mono code.
2. **Hero:** 4:3 straw-striped placeholder, grade in huge serif, "Hand-woven by **{weaver.name}** in {village}, {province}". If the name is hidden: "Hand-woven by a weaver from {village}, {province}". Desktop inline buttons: **Claim this hat** (only when allowed), **Share**, **Ask about this hat**.
3. **Specs strip:** tiles Rows per inch, Grade (with tooltip, Nice), Straw, Size "{n} cm", Price "${n}" only if `price_usd` is not null. Tooltip opens on tap and hover, closes on Esc and outside tap.
4. **Story timeline:** vertical, 5 steps (see section 6 for how dates and text are built).
5. **Weaver card:** initials avatar (generic person icon when the name is hidden), "Weaving since {year}" (omitted if null), bio as plain text (hidden when the name is hidden), "Other hats by {first name}: {n}" or "Other hats by this weaver: {n}". Hidden when `n = 0`.
6. **Ownership card:** chain Workshop → Seller → Buyer plus the ownership line (section 6, `ownershipView`). Never a person's name.

**Grade tooltip copy:** Superfino uses the handoff text "Superfino means 25+ rows per inch. Fewer than 1 in 100 hats reach this grade." Standard: "Standard means 8 to 14 rows per inch. A sturdy everyday weave." Fino: "Fino means 15 to 24 rows per inch. Light and smooth." (Standard and Fino copy is new, see Open questions.)

### Mobile vs desktop

- **Mobile (< 768px):** single column. Bottom bar: **Claim this hat** (flex, 50px) + Share + Ask when claim is allowed; Share + full-width **Ask** otherwise; "Registered to you" pill for the owner.
- **Desktop:** centered column (max 720px), inline hero buttons, concierge FAB bottom right.

### Claim dialogs (Nice)

| Viewer | Dialog |
|---|---|
| Logged out | "Log in to claim this hat" with **Log in** (`/login?next=/hat/{CODE}`) and **Create account** (`/signup?next=/hat/{CODE}`). |
| Recipient | "Claim {CODE} as yours?" with **Cancel** / **Claim** ("Claiming..."). Success: toast "This hat is now registered to you.", seal replays the stamp, bottom bar becomes "Registered to you", ownership line becomes "Registered to you since {date}". |
| Error `email_unconfirmed` | Inline in dialog: "Confirm your email first, then try again." (new copy) |
| Error `not_recipient` | Inline: "Only the person this hat was transferred to can claim it." (handoff tooltip copy), then `router.refresh()`. |
| Network error | Inline: "Couldn't reach the server. Check your connection and try again." with Retry. |

### Share

`ShareButton`: if `navigator.share` exists, call `navigator.share({ title, text: "Verified Panama hat {CODE}", url })`. Otherwise copy the canonical URL with `navigator.clipboard.writeText` and swap the label to "Copied!" for 2s. User cancel of the share sheet is not an error. The URL is always `https://{host}/hat/{CODE}` with no query string.

### Landing "Verify a hat" box

Lives on `/` (spec owned by landing, behaviour defined here):
- `CodeInput` is shared with Not verified: auto-uppercase, auto-insert hyphen after "TQ", max 8 chars, error "Codes look like TQ-7F3K2." after blur when invalid.
- **Verify** is disabled until `isValidCode(normalizeCode(value))`.
- On submit: `router.push("/hat/" + code + "?via=verify_box")`. Enter key submits.
- Not verified "Try another code" uses the same component with `via=retry`.

## 5. Data

Tables read: `hats`, `workshops`, `weavers`, `hat_events`, `hat_flags` (count only). Written by `claim_hat`: `hats`, `hat_events`, `app_logs`. Written by `log_passport_view`: `app_logs`.

`hat_events.type` values this spec relies on: `created`, `stage_advanced`, `transferred`, `claimed`, `archived` (see Open questions).

### `public_hat_passport(p_code text) returns jsonb`

```sql
create or replace function public.public_hat_passport(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_hat   hats%rowtype;
  v_ws    workshops%rowtype;
  v_wv    weavers%rowtype;
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_viewer text;
begin
  if p_code is null or p_code !~ '^TQ-[A-Z0-9]{5}$' then
    return null;
  end if;

  select * into v_hat from hats where code = p_code;
  if not found then
    return null;
  end if;

  select * into v_ws from workshops where id = v_hat.workshop_id;
  select * into v_wv from weavers  where id = v_hat.weaver_id;

  v_viewer := case
    when v_uid is null then 'anonymous'
    when v_hat.owner_type = 'buyer' and v_hat.owner_user_id = v_uid then 'owner'
    when v_hat.transfer_email is not null
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
               'to_stage', e.to_stage, 'at', e.created_at) order by e.created_at)
      from hat_events e
      where e.hat_id = v_hat.id
        and e.type in ('created','stage_advanced','transferred','claimed','archived')
    ), '[]'::jsonb),
    'open_flags', (select count(*) from hat_flags f
                    where f.hat_id = v_hat.id and f.reviewed_at is null),
    'ownership', jsonb_build_object(
      'owner_type',       v_hat.owner_type,
      'pending_transfer', v_hat.transfer_email is not null),
    'viewer', v_viewer
  );
end;
$$;

revoke all on function public.public_hat_passport(text) from public;
grant execute on function public.public_hat_passport(text) to anon, authenticated;
```

**Never returned:** any uuid (hat, workshop, weaver, user ids), `transfer_email`, `owner_user_id`, `hat_events.actor_id`, `note`, `run_id`, `source`, flag messages or reviewers, `version`, `price_usd` when `show_prices = false`, weaver `name` and `bio` when `show_name = false`. The viewer relation is computed inside the database so the email never has to leave it.

### `claim_hat(p_code text, p_request_id text) returns jsonb`

```sql
create or replace function public.claim_hat(p_code text, p_request_id text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_email     text;
  v_confirmed timestamptz;
  v_hat       hats%rowtype;
  v_prev      text;
  v_req       text := case when p_request_id ~ '^req_[0-9a-f]{12}$' then p_request_id end;
  v_result    text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select lower(email), email_confirmed_at into v_email, v_confirmed
  from auth.users where id = v_uid;

  if v_confirmed is null then
    v_result := 'email_unconfirmed';
  else
    select owner_type into v_prev from hats where code = p_code;
    update hats
       set owner_type = 'buyer', owner_user_id = v_uid, transfer_email = null,
           version = version + 1, updated_at = now()
     where code = p_code
       and transfer_email is not null
       and lower(transfer_email) = v_email
    returning * into v_hat;

    if found then
      v_result := 'claimed';
      insert into hat_events (hat_id, type, from_stage, to_stage, actor_id, source)
      values (v_hat.id, 'claimed', null, null, v_uid, 'manual');
    elsif exists (select 1 from hats where code = p_code
                    and owner_type = 'buyer' and owner_user_id = v_uid) then
      v_result := 'already_owner';
    else
      v_result := 'not_recipient';   -- also covers unknown code (no oracle)
    end if;
  end if;

  insert into app_logs (level, source, action, message, user_id, workshop_id,
                        request_id, hat_code, payload)
  values (case when v_result = 'claimed' then 'info' else 'warn' end,
          'db', 'hat.claim', 'Claim attempt: ' || v_result, v_uid, v_hat.workshop_id,
          v_req, left(p_code, 12),
          jsonb_build_object('result', v_result, 'from_owner_type', v_prev));

  return jsonb_build_object('ok', v_result in ('claimed','already_owner'),
                            'result', v_result, 'claimed_at', now());
end;
$$;

revoke all on function public.claim_hat(text, text) from public, anon;
grant execute on function public.claim_hat(text, text) to authenticated;
```

The `update ... where transfer_email = me` is a single atomic statement, so two tabs claiming at once cannot both win.

### `log_passport_view(...) returns void`

```sql
create or replace function public.log_passport_view(
  p_code text, p_via text, p_is_bot boolean, p_request_id text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_code  text := left(regexp_replace(coalesce(p_code, ''), '[^A-Z0-9-]', '', 'g'), 12);
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
          v_code, v_ws,
          jsonb_build_object(
            'via', case when p_via in ('qr','link','verify_box','retry') then p_via else 'link' end,
            'is_bot', coalesce(p_is_bot, false),
            'reason', case when v_found then null
                           when v_code !~ '^TQ-[A-Z0-9]{5}$' then 'invalid_format'
                           else 'not_found' end));
end;
$$;

revoke all on function public.log_passport_view(text, text, boolean, text) from public;
grant execute on function public.log_passport_view(text, text, boolean, text) to anon, authenticated;
```

`user_id` is left null on purpose: views are anonymous. Whether the code exists is decided by the database, not trusted from the caller.

### Seed needs (owned by the seed spec)

TQ-9A1M8: Superfino, 32 rows, Natural, 58 cm, `show_prices = false` for Taller Pillco, Manuel Delgado (`show_name = true`), `weaving_started_at` May 12, `stage_advanced` events Sep 12, Sep 15, Sep 24, Oct 2 (2026), `transferred` event Oct 10, `transfer_email` = the demo buyer account's email. This gives the claim demo. Manuel needs 4 other hats for "Other hats by Manuel: 4".

## 6. Server logic and API

### Page algorithm (`app/hat/[code]/page.tsx`)

```ts
export const dynamic = "force-dynamic";            // viewer relation depends on cookies
const getPassport = cache(async (code: string) =>  // React cache: metadata + page share one call
  (await supabaseServer()).rpc("public_hat_passport", { p_code: code }));

export default async function Page({ params, searchParams }) {
  const raw = decodeURIComponent(params.code);
  const code = normalizeCode(raw);                 // domain.ts, pure
  if (code !== raw && isValidCode(code)) redirect(`/hat/${code}`); // 308 canonical
  const { data, error } = isValidCode(code) ? await getPassport(code) : { data: null, error: null };
  if (error) throw error;                          // error boundary -> Page error card
  after(() => logView(code, searchParams.via, isBot(headers().get("user-agent")))); // fire and forget
  if (!data) return <NotVerified code={code} />;
  const story = buildStory(data);
  const own = ownershipView(data);
  return <Passport data={data} story={story} own={own} />;
}
```

`logView` calls `log_passport_view` and swallows errors (logging never breaks the page). `isBot` matches `/bot|crawler|spider|facebookexternalhit|WhatsApp|Slackbot|TelegramBot|Twitterbot|Discordbot/i`.

### `normalizeCode(input: string): string` (add to `domain.ts`)

1. Trim, uppercase, remove all whitespace.
2. Replace any Unicode dash (U+2010 to U+2015) or `_` with `-`.
3. If it matches `^TQ[A-Z0-9]{5}$`, insert `-` after `TQ`.
4. Return the result (no letter or digit swapping, because seed codes contain `0` and `1`).

### `buildStory(p): StoryStep[]`

```ts
type StoryStep = { stage: string; state: "done" | "current" | "upcoming";
                   date: string | null; desc: string };
```

- `stageAt[i]` = `at` of the first event with `type = 'stage_advanced'` and `to_stage = i` (i = 1..4).
- Weaving start = `weaving_started_at` ?? `created` event `at` ?? `created_at`. Weaving end = `stageAt[1]`.
- Weaving date: "May 12 to Sep 10" style when ended; "Since May 12" when current. Weaving end shown as the day before washing is not invented: use the washing date itself ("May 12 to Sep 12").
- Weaving desc: "About {duration} of hand-weaving in {village}, {province}". `duration` from `humanDuration(days)`: < 14 days "{n} days", < 60 days "{n} weeks", else "{round(days/30)} months".
- Fixed descs: Washing "Washed in clean water to soften the straw"; Bleaching "Evened in tone, keeping its natural color"; Blocking "Shaped on a wooden form"; Finished "Trimmed, banded and approved by {workshop.name}".
- `i < stage` done, `i == stage` current ("In progress since {date}"; Finished is done, not current), `i > stage` upcoming with date null and desc "Not yet".
- A done stage with no event (legacy row) shows date null and "Date not recorded".
- Finished date shown in the certificate = `stageAt[4]`.

### `ownershipView(p): { line: string; claim: "button" | "login" | "owned" | "none" }`

`transferredAt` = last `transferred` event `at`; `ownerSince` = last `claimed` event `at`. Dates as "Oct 10, 2026".

| Hat state | viewer | line | claim |
|---|---|---|---|
| pending_transfer | recipient | "Transferred to you on {transferredAt}. Claim it to register it in your name." | button |
| pending_transfer | anonymous | "Transferred to a buyer on {transferredAt}. Log in to claim it if it's yours." | login |
| pending_transfer | other / owner | "Transferred to a buyer on {transferredAt}. Waiting for them to claim it." | none |
| owner_type buyer | owner | "Registered to you since {ownerSince}" | owned |
| owner_type buyer | anyone else | "Owned by a verified buyer since {ownerSince}" | none |
| owner_type seller | any | "With a verified seller." (new copy) | none |
| owner_type workshop | any | "Held by {workshop.name}, the workshop that recorded it." (new copy) | none |

### Claim (client)

```ts
async function claim(code: string) {
  const request_id = newRequestId();
  const { data, error } = await supabase.rpc("claim_hat", { p_code: code, p_request_id: request_id });
  if (error) return { kind: "network" };
  if (data.ok) { playStamp(); toast("This hat is now registered to you."); router.refresh(); }
  return data;
}
```

### Metadata (`generateMetadata`)

- Verified: title "{Grade} Panama hat by {weaver name or 'a weaver from {village}'} · Verified · Toquilla Trace"; description "Hand-woven in {village}, {province}. {rows} rows per inch. {Finished Mon D, YYYY | In production}. See its full story and ask about it."
- Not verified: title "We can't verify this hat · Toquilla Trace", description "This code isn't in our records."
- Always: `alternates.canonical = /hat/{CODE}`, `openGraph { type: "website", siteName: "Toquilla Trace", url, title, description, images: ["/og-passport.png" or dynamic] }`, `twitter { card: "summary_large_image" }`, `robots: { index: false, follow: false }` (see Open questions).
- Metadata never contains price, owner, or email.

### Performance target

- One database round trip per render (passport RPC; log is after the response).
- TTFB under 400ms p75 on Vercel; LCP under 1.5s on a mid-range phone on 4G.
- No client JS for the static sections; client components only for Seal animation, GradeTip, Share, Claim, bottom bar. Concierge panel loaded with `next/dynamic` on first open. Passport route client JS budget 90 KB gzip excluding the concierge chunk.
- No web fonts beyond the 3 Google fonts with `display: swap`.

## 7. Business rules and edge cases

1. `/hat/tq-9a1m8` redirects (308) to `/hat/TQ-9A1M8`.
2. `/hat/TQ9A1M8` redirects to `/hat/TQ-9A1M8`.
3. `/hat/TQ-9A1M` (4 chars) renders Not verified without calling `public_hat_passport`, and logs `passport.verify_failed` with `reason: "invalid_format"`.
4. `/hat/TQ-ZZZZZ` renders Not verified and logs `reason: "not_found"`.
5. A found hat at stage 1 shows "In production · Washing since {date}" and 3 upcoming steps.
6. Archived hats still show Verified, plus the archived banner.
7. Price tile appears only when `workshops.show_prices = true` and `price_usd` is not null.
8. With `weavers.show_name = false`, the page shows no weaver name, no bio, and "Other hats by this weaver".
9. The page HTML never contains the string of `transfer_email` (checked in tests by rendering with a seeded record).
10. The anon role cannot `select` from `hats`, `weavers`, `hat_events`, `workshops` directly (RLS); only the RPC works.
11. Claim button shows only for `claim` = `button` or `login`. "Anyone else" sees no button at all (revision 2 table wins over the disabled-tooltip line, see Open questions).
12. `claim_hat` by a user whose email differs from `transfer_email` returns `not_recipient` and changes nothing.
13. `claim_hat` with matching email but unconfirmed email returns `email_unconfirmed` and changes nothing.
14. Successful claim sets `owner_type = 'buyer'`, `owner_user_id = auth.uid()`, `transfer_email = null`, `version + 1`, adds one `claimed` event and one `hat.claim` log row.
15. A second claim by the same user returns `already_owner` with `ok: true` (idempotent).
16. Email match is case insensitive (`Ana@Shop.com` equals `ana@shop.com`).
17. `claim_hat` for an unknown code returns `not_recipient` (no way to probe which codes exist via claim).
18. Login return URL: `next` is accepted only if it starts with `/` and not `//` (open redirect guard, owned by auth spec).
19. Share URL never includes `?via=` or other query params.
20. A logging failure never changes what the page renders.

## 8. Logging

| Action | Where | Level | Fields |
|---|---|---|---|
| `passport.view` | `log_passport_view` (source `db`) | info | `hat_code`, `workshop_id`, `request_id`, payload `{ via, is_bot }`. `user_id` null. |
| `passport.verify_failed` | `log_passport_view` | warn | `hat_code` (sanitized, max 12 chars), payload `{ via, is_bot, reason: "invalid_format" \| "not_found" }` |
| `hat.claim` | `claim_hat` (source `db`) | info on success, warn otherwise | `user_id`, `workshop_id`, `hat_code`, `request_id`, payload `{ result, from_owner_type }`. No email. |
| `ui.error` | client error boundary on the passport | error | `request_id`, `hat_code`, `error { message, stack }` |

The landing Verify box does not log separately; the resulting page view carries `via: "verify_box"`.

## 9. Security and privacy

- Anonymous access is only through `public_hat_passport` and `log_passport_view`, both `security definer` with `search_path` pinned and an explicit return shape. No table is readable by `anon`.
- `transfer_email` and `owner_user_id` are compared inside the database and never returned. The browser learns only `viewer` (`anonymous`, `recipient`, `owner`, `other`).
- `claim_hat` is granted to `authenticated` only, matches by the email from `auth.users`, requires a confirmed email, and is one atomic update.
- Event `note`, `actor_id` and flag messages are internal workshop data and never shown publicly.
- Weaver privacy: `show_name = false` hides name and bio (a bio usually names the person).
- Bio and every text field render as React text nodes. No `dangerouslySetInnerHTML`, no markdown.
- Logs hold no IP, no user agent string, no email. `is_bot` is a boolean only.
- `robots: noindex` stops search engines from building a list of codes.
- Known gap: `log_passport_view` can be called by anyone to add rows. Accepted for v1 (fixed shape, small rows); rate limiting it is a next step.

## 10. Tests

Vitest, pure functions:

| Function | Input | Expected |
|---|---|---|
| `normalizeCode` | `" tq-9a1m8 "` | `"TQ-9A1M8"` |
| `normalizeCode` | `"TQ9A1M8"` | `"TQ-9A1M8"` |
| `normalizeCode` | `"TQ–9A1M8"` (en dash) | `"TQ-9A1M8"` |
| `normalizeCode` | `"TQ-2C5P0"` | `"TQ-2C5P0"` (no 0/O swap) |
| `normalizeCode` + `isValidCode` | `"TQ-9A1M"` | `false` |
| `buildStory` | seed TQ-9A1M8 | 5 steps all `done`; step 0 date "May 12 to Sep 12", desc "About 4 months of hand-weaving in Pile, Manabí"; step 4 desc "Trimmed, banded and approved by Taller Pillco" |
| `buildStory` | stage 1, washing event Oct 14 | step 1 `current`, steps 2..4 `upcoming` with desc "Not yet" |
| `humanDuration` | 10 / 21 / 121 | "10 days" / "3 weeks" / "4 months" |
| `ownershipView` | pending, viewer `recipient`, transferred Oct 10 | line "Transferred to you on Oct 10, 2026. Claim it to register it in your name.", claim `button` |
| `ownershipView` | pending, `anonymous` | claim `login` |
| `ownershipView` | pending, `other` | line ends "Waiting for them to claim it.", claim `none` |
| `ownershipView` | buyer, `owner`, claimed Oct 18 | "Registered to you since Oct 18, 2026", `owned` |
| `gradeTip` | `"Superfino"` | handoff copy exactly |
| `passportMeta` | seed with `price_usd: 480` | title and description contain no "$" |

SQL tests (run against local Supabase in a script, Nice):
- As `anon`: `select * from hats` returns 0 rows or permission error; `select public_hat_passport('TQ-9A1M8')` returns JSON without keys `transfer_email`, `owner_user_id`, `id`.
- Weaver `show_name = false`: JSON `weaver.name` is null.
- `claim_hat` as wrong user: `result = 'not_recipient'`, `hats.transfer_email` unchanged.
- `claim_hat` as recipient: `result = 'claimed'`, one new `hat_events` row type `claimed`.

## 11. Acceptance criteria

- [ ] Logged out, `/hat/TQ-9A1M8` shows the Verified certificate, "Recorded by Taller Pillco, Cuenca", "Finished Oct 2, 2026" and 5 dated story steps.
- [ ] `/hat/tq-9a1m8` lands on `/hat/TQ-9A1M8`.
- [ ] `/hat/TQ-ZZZZZ` shows "We can't verify this hat" and the 3 tips; Try another code reveals a working input.
- [ ] Landing: typing `tq9a1m8` in the Verify box enables Verify and opens the passport.
- [ ] No price tile while Show prices is off; turning it on (in DB) shows the price.
- [ ] View source of the passport contains no `@` email other than the workshop contact, and no uuid.
- [ ] Logged out, Claim opens "Log in to claim this hat"; after login the user is back on the passport.
- [ ] Logged in as the demo buyer, Claim registers the hat with the stamp and "Registered to you since {today}".
- [ ] Logged in as a workshop member, no Claim button is shown.
- [ ] Share on a phone opens the native share sheet; on desktop it shows "Copied!".
- [ ] Pasting the link into WhatsApp or Slack shows the title with grade, weaver and "Verified".
- [ ] `app_logs` has a `passport.view` row per visit with `user_id` null and `via` set, and a `passport.verify_failed` row for the bad code.
- [ ] Archived hat shows the archived banner and still shows Verified.

## 12. Build plan

Share of the 2 hours: about 12 minutes for the Musts (10%), plus 8 minutes of Nice items only if time remains.

| # | Task | Min |
|---|---|---|
| 1 | Migration: `public_hat_passport`, `log_passport_view`, grants | 3 |
| 2 | `normalizeCode`, `buildStory`, `ownershipView` + tests | 3 |
| 3 | Page: redirect, RPC, Not verified, Verified sections (port markup from prototype) | 4 |
| 4 | Metadata + static OG image, Share button, landing Verify routing | 2 |
| 5 | (Nice) `claim_hat` migration, ClaimButton + dialogs, stamp replay | 5 |
| 6 | (Nice) Grade tooltip, loading skeleton, open flags note | 3 |

## 13. Interview talking points

- One security definer function is the whole public API. It returns a fixed shape, so a new column on `hats` can never leak by accident.
- The "is this you?" check happens in the database. The browser only learns a role word, never the email it was compared to.
- Claim is a single conditional `update`, which makes it race safe and idempotent without app locks.
- The story is computed from the append-only `hat_events`, so the timeline a buyer sees is the same audit trail the workshop approved.
- Weaving time is shown as "About 4 months": the duration is the authenticity signal, and a too-fast weave is an anomaly elsewhere in the app.
- Privacy by design: ownership lines say "a verified buyer", weaver names follow `show_name`, logs hold no IP or user id.
- Link previews matter more than SEO here: passports travel by WhatsApp, so OG tags are a Must and indexing is off.

## 14. Open questions

1. `hat_events.type` values are not listed in conventions. This spec assumes `created`, `stage_advanced`, `transferred`, `claimed`, `archived`.
2. Transfers to a seller: `claim_hat` always sets `owner_type = 'buyer'` (as briefed). If seller transfers also use `transfer_email`, a `transfer_to owner_type` column is needed.
3. Handoff conflict: "Who sees Claim" says no button for others; the Claim flow bullet says disabled with a tooltip. This spec follows the revision 2 table (no button).
4. Handoff sample data says TQ-9A1M8 owner is "buyer". For the claim demo the seed should leave it as a pending transfer. Seed spec should decide.
5. Code alphabet conflict: `CODE_ALPHABET` excludes `0`, `1`, `I`, `O`, but sample codes TQ-2C5P0 and TQ-4K9D1 contain `0` and `1`. Normalization therefore never swaps characters.
6. `normalizeCode` is a new pure function for `domain.ts`, not in the conventions list.
7. Claim safety needs email confirmation enabled in Supabase Auth. If confirmation is off (common for a timeboxed demo), `email_confirmed_at` is set at signup and anyone could sign up with the recipient's email and claim. Decide before deploy.
8. Exposing `workshops.contact_email` publicly (needed for "Contact the workshop" mailto). Assumed to be a business address.
9. New copy not in the handoff: Standard and Fino tooltips, "With a verified seller.", "Held by {workshop}...", "Confirm your email first, then try again.", "The workshop is reviewing part of this record.", "In production · {Stage} since {date}".
10. `noindex` on all passports is a privacy default; product may want the sample passport indexed.
11. The README plan gives 20 minutes to passport plus concierge together; these two specs need about 25 minutes of Musts.
