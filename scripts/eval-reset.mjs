#!/usr/bin/env node
// Restores the Eval Workshop to its seeded state (npm run eval:reset).
// Calls reset_eval_workshop() (migration 20261019001003, service role only): deletes the
// workshop's proposals and agent runs, extra hats, events and flags, and puts the 5 eval hats
// back at their seeded stage and version. Never touches any other workshop.
// Plain Node (>= 20), no dependencies. Never prints keys.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run: npm run eval:reset");
  process.exit(1);
}

const res = await fetch(`${url}/rest/v1/rpc/reset_eval_workshop`, {
  method: "POST",
  headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: "{}",
});
const text = await res.text();
if (!res.ok) {
  console.error(`reset_eval_workshop failed: ${res.status} ${text.slice(0, 200)}`);
  process.exit(1);
}
console.log("Eval Workshop reset:", text);
