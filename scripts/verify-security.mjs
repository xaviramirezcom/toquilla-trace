#!/usr/bin/env node
// Live security checks against the hosted Supabase project (npm run verify:security).
// Signs in as the demo accounts and probes the database boundary through PostgREST, the same way
// a browser or curl would. Prints PASS/FAIL per check and exits 1 if anything fails.
//
// Writes it makes: one throwaway hat in Toquilla Trace HQ (admin workshop) that is transferred to
// the demo buyer, claimed, then archived. Probes that should be refused use a filter that matches
// no row where possible, so even a regression changes nothing. Demo data is never modified.
// Env (.env): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//             DEMO_ADMIN_EMAIL, DEMO_MEMBER_EMAIL, DEMO_BUYER_EMAIL, DEMO_PASSWORD.
// Never prints the password or keys.

const need = (name) => {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing env var ${name}. Run with: npm run verify:security`);
    process.exit(1);
  }
  return v;
};
const URL_ = need("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
const ANON = need("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SVC = need("SUPABASE_SERVICE_ROLE_KEY");
const PASSWORD = need("DEMO_PASSWORD");

const WS_PILLCO = "11111111-1111-4111-8111-111111111111";
const WS_HQ = "22222222-2222-4222-8222-222222222222";
const WS_EVAL = "33333333-3333-4333-8333-333333333333";
const HQ_WEAVER = "bbbbbbbb-0000-4000-8000-000000000021"; // migration 20261019001003
const NO_ROW = "00000000-0000-4000-8000-000000000000";
const TABLES = [
  "workshops",
  "profiles",
  "weavers",
  "hats",
  "hat_events",
  "hat_flags",
  "agent_runs",
  "proposals",
  "app_logs",
];
const SERVICE_ONLY_RPCS = {
  apply_proposal: { p_proposal_id: NO_ROW, p_actor: NO_ROW, p_payload: {} },
  save_agent_run: {
    p_run_id: NO_ROW,
    p_status: "failed",
    p_summary: null,
    p_steps: [],
    p_proposals: [],
    p_tokens_in: 0,
    p_tokens_out: 0,
    p_latency_ms: 0,
    p_cost_usd: 0,
    p_model: "x",
  },
  seed_backfill_actors: { p_workshop_id: NO_ROW, p_actor: NO_ROW },
  reset_eval_workshop: {},
  strip_pii_keys: { p: {} },
  log_flood_guard: { p_action: "x" },
};

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}
const denied = (r) => r.status === 401 || r.status === 403;

async function rest(token, path, { method = "GET", body, prefer, key = ANON } = {}) {
  const headers = { apikey: key, Authorization: `Bearer ${token ?? key}`, "Content-Type": "application/json" };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // keep text
  }
  return { status: res.status, body: data };
}
const rpc = (token, fn, args) => rest(token, `rpc/${fn}`, { method: "POST", body: args });
const service = (path, opts = {}) => rest(SVC, path, { ...opts, key: SVC });
const errText = (r) => JSON.stringify(r.body ?? "");

async function signIn(email) {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const data = await res.json();
  if (!data.access_token) {
    console.error(`FAIL sign in as ${email.replace(/^(.).*@/, "$1***@")} (${res.status})`);
    process.exit(1);
  }
  return { token: data.access_token, uid: data.user.id, email: email.toLowerCase() };
}

const member = await signIn(need("DEMO_MEMBER_EMAIL"));
const admin = await signIn(need("DEMO_ADMIN_EMAIL"));
const buyer = await signIn(need("DEMO_BUYER_EMAIL"));

console.log("\n# Anonymous");
for (const t of TABLES) {
  const r = await rest(null, `${t}?select=*&limit=1`);
  check(`anon cannot read ${t}`, denied(r), String(r.status));
}
for (const [fn, args] of Object.entries(SERVICE_ONLY_RPCS)) {
  const r = await rpc(null, fn, args);
  check(`anon cannot call ${fn}`, denied(r), String(r.status));
}
{
  const r = await rpc(null, "public_hat_passport", { p_code: "TQ-9A1M8" });
  const json = errText(r);
  check("passport TQ-9A1M8 is public", r.status === 200 && r.body?.code === "TQ-9A1M8", String(r.status));
  check(
    "passport has no ids, transfer email or owner id",
    !/transfer_email|owner_user_id|"id"|@test\.com|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
      json,
    ),
  );
  const big = await rpc(null, "log_public", {
    action: "ui.error",
    level: "error",
    payload: { blob: "x".repeat(9000) },
  });
  check(
    "log_public rejects a payload over 8 KB",
    big.status >= 400 && /payload_too_large/.test(errText(big)),
    String(big.status),
  );
  const other = await rpc(null, "log_public", { action: "proposal.approve", level: "info", payload: {} });
  check("log_public refuses actions outside the allowlist", other.status >= 400, String(other.status));
}

console.log("\n# Member (Taller Pillco)");
{
  const ws = await rest(member.token, "workshops?select=id");
  check(
    "member sees only its own workshop",
    Array.isArray(ws.body) && ws.body.length === 1 && ws.body[0].id === WS_PILLCO,
  );
  for (const wsId of [WS_HQ, WS_EVAL]) {
    const r = await rest(member.token, `hats?workshop_id=eq.${wsId}&select=id`);
    check(`member cannot read hats of workshop ${wsId.slice(0, 8)}`, Array.isArray(r.body) && r.body.length === 0);
  }
  for (const t of ["agent_runs", "app_logs"]) {
    const r = await rest(member.token, `${t}?select=id&limit=1`);
    check(`member reads 0 rows from ${t}`, Array.isArray(r.body) && r.body.length === 0);
  }
  for (const col of [
    { grade: "Fino" },
    { weaver_id: HQ_WEAVER },
    { stage: 1 },
    { price_usd: 1 },
    { archived: true },
    { transfer_email: "x@example.com" },
  ]) {
    const r = await rest(member.token, `hats?id=eq.${NO_ROW}`, { method: "PATCH", body: col });
    check(`member cannot update hats.${Object.keys(col)[0]}`, denied(r), String(r.status));
  }
  let r = await rest(member.token, "hats", {
    method: "POST",
    body: { code: "TQ-QQQQQ", workshop_id: WS_PILLCO, grade: "Fino", rows_per_inch: 18 },
  });
  check("member cannot insert hats", denied(r), String(r.status));
  r = await rest(member.token, "hat_events", {
    method: "POST",
    body: { hat_id: NO_ROW, type: "edited", actor_id: member.uid, source: "manual" },
  });
  check("member cannot insert hat_events", denied(r), String(r.status));
  r = await rest(member.token, `hat_events?id=eq.${NO_ROW}`, { method: "DELETE" });
  check("member cannot delete hat_events", denied(r), String(r.status));
  r = await rest(member.token, `profiles?id=eq.${member.uid}`, { method: "PATCH", body: { role: "admin" } });
  check("member cannot change its own role", denied(r), String(r.status));
  r = await rest(member.token, `profiles?id=eq.${member.uid}`, { method: "PATCH", body: { workshop_id: WS_HQ } });
  check("member cannot change its own workshop", denied(r), String(r.status));
  r = await rest(member.token, `hat_flags?id=eq.${NO_ROW}`, {
    method: "PATCH",
    body: { reviewed_at: new Date().toISOString() },
  });
  check("member cannot update hat_flags directly", denied(r), String(r.status));
  for (const [fn, args] of Object.entries(SERVICE_ONLY_RPCS)) {
    r = await rpc(member.token, fn, args);
    check(`member cannot call ${fn}`, denied(r), String(r.status));
  }
  r = await rpc(member.token, "create_hat", { p_weaver_id: HQ_WEAVER, p_grade: "Fino", p_rows: 18 });
  check(
    "member cannot create a hat with another workshop's weaver",
    /weaver_not_found/.test(errText(r)),
    String(r.status),
  );
  r = await rpc(member.token, "advance_hat", { p_code: "TQ-E7F3K", p_expected_version: 1 });
  check("member cannot advance another workshop's hat", /not_found/.test(errText(r)), String(r.status));
}

console.log("\n# Claim flow (throwaway hat in Toquilla Trace HQ)");
let code = null;
try {
  let r = await rpc(admin.token, "create_hat", {
    p_weaver_id: HQ_WEAVER,
    p_grade: "Fino",
    p_rows: 18,
    p_note: "verify-security throwaway",
  });
  code = r.body?.[0]?.code ?? null;
  check(
    "admin creates a hat in HQ through create_hat",
    r.status === 200 && !!code,
    `${r.status} ${code ?? errText(r).slice(0, 80)}`,
  );
  if (!code) throw new Error("no hat");

  r = await rpc(admin.token, "create_hat", { p_weaver_id: HQ_WEAVER, p_grade: "Superfino", p_rows: 18 });
  check("create_hat blocks a grade/rows mismatch", /grade_mismatch/.test(errText(r)), String(r.status));

  r = await rpc(admin.token, "advance_hat", { p_code: code, p_expected_version: 1 });
  check(
    "advance_hat moves one stage",
    r.status === 200 && r.body?.[0]?.stage === 1 && r.body?.[0]?.version === 2,
    errText(r),
  );
  r = await rpc(admin.token, "advance_hat", { p_code: code, p_expected_version: 1 });
  check(
    "stale version fails with version_conflict",
    r.status === 400 && /version_conflict/.test(errText(r)),
    String(r.status),
  );

  r = await rpc(admin.token, "transfer_hat", {
    p_code: code,
    p_expected_version: 2,
    p_to: "buyer",
    p_email: buyer.email,
  });
  check(
    "admin transfers the hat to the demo buyer",
    r.status === 200 && r.body?.owner_type === "buyer",
    String(r.status),
  );

  r = await rpc(buyer.token, "public_hat_passport", { p_code: code });
  check(
    "buyer sees itself as the recipient",
    r.body?.viewer === "recipient" && r.body?.ownership?.pending_transfer === true,
    r.body?.viewer,
  );
  r = await rpc(member.token, "claim_hat", { p_code: code });
  check("someone else cannot claim it", r.body?.result === "not_recipient", r.body?.result);
  r = await rpc(null, "claim_hat", { p_code: code });
  check("anon cannot claim", denied(r) || r.body?.result === "not_authenticated", String(r.status));
  r = await rpc(buyer.token, "claim_hat", { p_code: code });
  check("buyer claims it", r.body?.ok === true && r.body?.result === "claimed", r.body?.result);
  r = await rpc(buyer.token, "claim_hat", { p_code: code });
  check("claiming again reports already_owner", r.body?.result === "already_owner", r.body?.result);
  r = await rpc(buyer.token, "public_hat_passport", { p_code: code });
  check(
    "passport shows the buyer as owner",
    r.body?.viewer === "owner" && r.body?.ownership?.pending_transfer === false,
    r.body?.viewer,
  );
  r = await rpc(null, "public_hat_passport", { p_code: code });
  check("anonymous passport still hides the owner", r.body?.viewer === "anonymous" && !errText(r).includes(buyer.uid));
  r = await rpc(admin.token, "archive_hat", { p_code: code, p_expected_version: 3 });
  check("workshop can no longer archive a claimed hat", r.status >= 400, String(r.status));
} catch (err) {
  check("claim flow ran to the end", false, String(err.message ?? err));
} finally {
  if (code) {
    // archive_hat only works while the workshop owns the hat, so cleanup uses the service role.
    const r = await service(`hats?code=eq.${code}&workshop_id=eq.${WS_HQ}`, {
      method: "PATCH",
      body: { archived: true },
      prefer: "return=minimal",
    });
    check(`cleanup: throwaway hat ${code} archived`, r.status === 204, String(r.status));
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
