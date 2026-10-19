#!/usr/bin/env node
// Creates or updates the 3 demo users plus the eval user and links them to the seeded workshops.
// Run after `supabase db push`:  node --env-file=.env scripts/seed-users.mjs
// Plain Node (>= 20), no dependencies. Never prints the password or keys.
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//      DEMO_ADMIN_EMAIL, DEMO_MEMBER_EMAIL, DEMO_BUYER_EMAIL, DEMO_PASSWORD
// Optional: EVAL_EMAIL (default eval@test.com), EVAL_PASSWORD (default DEMO_PASSWORD) for the
//      Eval Workshop member that `npm run eval` signs in as.

const WS_PILLCO = "11111111-1111-4111-8111-111111111111";
const WS_HQ = "22222222-2222-4222-8222-222222222222";
const WS_EVAL = "33333333-3333-4333-8333-333333333333";
const CLAIM_DEMO_CODE = "TQ-9A1M8";

const env = (name) => {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(`Missing env var ${name}. Run with: node --env-file=.env scripts/seed-users.mjs`);
    process.exit(1);
  }
  return v.trim();
};

const url = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
const key = env("SUPABASE_SERVICE_ROLE_KEY");
const password = env("DEMO_PASSWORD");
const evalEmail = (process.env.EVAL_EMAIL?.trim() || "eval@test.com").toLowerCase();
const evalPassword = process.env.EVAL_PASSWORD?.trim() || password;
const users = [
  { label: "admin", email: env("DEMO_ADMIN_EMAIL").toLowerCase(), name: "Toquilla Trace Admin", role: "admin", workshop_id: WS_HQ },
  { label: "member", email: env("DEMO_MEMBER_EMAIL").toLowerCase(), name: "Xavier", role: "member", workshop_id: WS_PILLCO },
  { label: "buyer", email: env("DEMO_BUYER_EMAIL").toLowerCase(), name: "Demo Buyer", role: "member", workshop_id: null },
  { label: "eval", email: evalEmail, name: "Eval Runner", role: "member", workshop_id: WS_EVAL, password: evalPassword },
];

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function call(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { ...headers, ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    // Error bodies from Supabase never echo the password or key, but keep it short anyway.
    const msg = typeof data === "object" && data ? data.msg || data.message || data.error_description || data.error : data;
    throw new Error(`${method} ${path.split("?")[0]} -> ${res.status}: ${String(msg).slice(0, 200)}`);
  }
  return data;
}

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const data = await call("GET", `/auth/v1/admin/users?page=${page}&per_page=200`);
    const list = Array.isArray(data) ? data : data?.users ?? [];
    const hit = list.find((u) => (u.email || "").toLowerCase() === email);
    if (hit) return hit;
    if (list.length < 200) return null;
  }
  return null;
}

async function upsertAuthUser(u) {
  const existing = await findUserByEmail(u.email);
  const attrs = { password: u.password ?? password, email_confirm: true, user_metadata: { name: u.name } };
  if (existing) {
    await call("PUT", `/auth/v1/admin/users/${existing.id}`, attrs);
    return { id: existing.id, created: false };
  }
  const created = await call("POST", "/auth/v1/admin/users", { email: u.email, ...attrs });
  return { id: created.id ?? created.user?.id, created: true };
}

async function main() {
  const summary = [];
  const ids = {};

  for (const u of users) {
    const { id, created } = await upsertAuthUser(u);
    ids[u.label] = id;
    // Upsert the profile (the auth trigger normally creates it with role member, no workshop).
    await call(
      "POST",
      "/rest/v1/profiles?on_conflict=id",
      { id, name: u.name, role: u.role, workshop_id: u.workshop_id },
      { Prefer: "resolution=merge-duplicates,return=minimal" },
    );
    summary.push(`${u.label.padEnd(6)} ${u.email}  ${created ? "created" : "updated"}  role=${u.role}  workshop=${u.workshop_id === WS_HQ ? "Toquilla Trace HQ" : u.workshop_id === WS_PILLCO ? "Taller Pillco" : u.workshop_id === WS_EVAL ? "Eval Workshop" : "none"}`);
  }

  // Claim demo (D22): the seeded transfer points at buyer@test.com; align it with the real
  // demo buyer email, but only while the hat is still unclaimed.
  const hats = await call("GET", `/rest/v1/hats?code=eq.${CLAIM_DEMO_CODE}&select=id,transfer_email,owner_user_id`);
  const hat = Array.isArray(hats) ? hats[0] : null;
  let claimNote = "claim demo hat not found";
  if (hat) {
    const buyer = users.find((u) => u.label === "buyer").email;
    if (hat.owner_user_id) {
      claimNote = `${CLAIM_DEMO_CODE} already claimed, left as is`;
    } else if ((hat.transfer_email || "").toLowerCase() !== buyer) {
      await call("PATCH", `/rest/v1/hats?id=eq.${hat.id}&owner_user_id=is.null`, { transfer_email: buyer }, { Prefer: "return=minimal" });
      claimNote = `${CLAIM_DEMO_CODE} transfer now points at the demo buyer`;
    } else {
      claimNote = `${CLAIM_DEMO_CODE} transfer already points at the demo buyer`;
    }
  }

  // Fill NULL actor ids on seeded history.
  const memberFill = await call("POST", "/rest/v1/rpc/seed_backfill_actors", { p_workshop_id: WS_PILLCO, p_actor: ids.member });
  const adminFill = await call("POST", "/rest/v1/rpc/seed_backfill_actors", { p_workshop_id: WS_HQ, p_actor: ids.admin });
  const evalFill = await call("POST", "/rest/v1/rpc/seed_backfill_actors", { p_workshop_id: WS_EVAL, p_actor: ids.eval });

  console.log("Demo users:");
  for (const line of summary) console.log(`  ${line}`);
  console.log(`Claim demo: ${claimNote}`);
  console.log(`Backfilled Taller Pillco -> member: ${JSON.stringify(memberFill)}`);
  console.log(`Backfilled Toquilla Trace HQ -> admin: ${JSON.stringify(adminFill)}`);
  console.log(`Backfilled Eval Workshop -> eval: ${JSON.stringify(evalFill)}`);
  console.log("Done. Passwords are DEMO_PASSWORD (and EVAL_PASSWORD if set) from your .env (not printed).");
}

main().catch((err) => {
  console.error(`seed-users failed: ${err.message}`);
  process.exit(1);
});
