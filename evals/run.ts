// Agent eval runner (spec 10 section 6.2). Calls the deployed Edge Functions with evals/cases.json,
// scores each case (lib/admin/eval-score.ts), prints a table and writes evals/results/latest.json.
//
// Safety: it never calls apply-proposals, so no proposal is ever approved. Workshop cases run only as
// the Eval Workshop user (EVAL_EMAIL / EVAL_PASSWORD) and are skipped otherwise, so demo data stays clean.
//
//   npm run eval                          all cases against the deployed functions
//   npm run eval -- --target local        against `npx supabase functions serve`
//   npm run eval -- --only canonical-rev2
//   npm run eval -- --tag safety --min 1  exit 1 unless every selected case passes
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  filterCases,
  formatEvalTable,
  scoreConcierge,
  scoreWorkshop,
  type EvalCase,
  type EvalResultRow,
} from "../lib/admin/eval-score";
import { newRequestId } from "../lib/request-id";

const here = dirname(fileURLToPath(import.meta.url));

function flag(name: string): string | null {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(name);
  if (i >= 0) return argv[i + 1] ?? null;
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Tool count and cost from agent_runs, only when a local service role key exists (members get no meta, D8). */
async function runStats(base: string, serviceKey: string | undefined, requestId: string): Promise<{ tools: number | null; cost: number | null }> {
  if (!serviceKey) return { tools: null, cost: null };
  try {
    const p = new URLSearchParams({ select: "cost_usd,steps", request_id: `eq.${requestId}`, limit: "1" });
    const res = await fetch(`${base}/rest/v1/agent_runs?${p}`, { headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } });
    if (!res.ok) return { tools: null, cost: null };
    const rows = (await res.json()) as { cost_usd: number | string | null; steps: unknown }[];
    const row = rows[0];
    if (!row) return { tools: null, cost: null };
    const steps = Array.isArray(row.steps) ? (row.steps as { kind?: string }[]) : [];
    const cost = row.cost_usd === null ? null : Number(row.cost_usd);
    return { tools: steps.filter((s) => s.kind === "tool_call").length, cost: Number.isFinite(cost) ? cost : null };
  } catch {
    return { tools: null, cost: null };
  }
}

async function main(): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env (see docs/specs/10)");
    return 1;
  }
  const casesPath = join(here, "cases.json");
  let cases: EvalCase[];
  try {
    cases = JSON.parse(readFileSync(casesPath, "utf8")) as EvalCase[];
  } catch {
    console.error("evals/cases.json is missing or not valid JSON.");
    return 1;
  }
  const selected = filterCases(cases, flag("--only"), flag("--tag"));
  if (selected.length === 0) {
    console.error("No cases match --only / --tag.");
    return 1;
  }

  const target = flag("--target") ?? "remote";
  const fnBase = target === "local" ? "http://127.0.0.1:54321/functions/v1" : `${url}/functions/v1`;
  const restBase = target === "local" ? "http://127.0.0.1:54321" : url;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;

  // Sign in as the Eval Workshop member. Workshop cases are skipped without it.
  let jwt: string | null = null;
  // Same defaults as scripts/seed-users.mjs: eval@test.com, password EVAL_PASSWORD or DEMO_PASSWORD.
  const evalEmail = process.env.EVAL_EMAIL?.trim() || "eval@test.com";
  const evalPassword = process.env.EVAL_PASSWORD?.trim() || process.env.DEMO_PASSWORD?.trim() || "";
  let skipReason = "set EVAL_PASSWORD or DEMO_PASSWORD and run scripts/seed-users.mjs (Eval Workshop user)";
  if (evalPassword && selected.some((c) => c.agent === "workshop")) {
    const sb = createClient(target === "local" ? restBase : url, anon, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.signInWithPassword({ email: evalEmail, password: evalPassword });
    if (error || !data.session) {
      skipReason = "eval user sign-in failed";
    } else {
      const { data: prof } = await sb.from("profiles").select("workshops(name)").eq("id", data.user.id).maybeSingle();
      const ws = (prof as { workshops: { name: string } | { name: string }[] | null } | null)?.workshops;
      const wsName = Array.isArray(ws) ? ws[0]?.name : ws?.name;
      if (wsName === "Eval Workshop") jwt = data.session.access_token;
      else skipReason = "the eval user is not in the Eval Workshop";
    }
  }

  const rows: EvalResultRow[] = [];
  for (const c of selected) {
    const request_id = newRequestId();
    if (c.agent === "workshop" && !jwt) {
      rows.push({ id: c.id, pass: false, checks: [], tools: null, latency_ms: 0, cost_usd: null, request_id, skipped: skipReason });
      continue;
    }
    const t0 = Date.now();
    try {
      const res = await fetch(`${fnBase}/${c.agent === "workshop" ? "workshop-agent" : "concierge"}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": request_id,
          authorization: `Bearer ${c.agent === "workshop" ? jwt : anon}`,
          apikey: anon,
        },
        body: JSON.stringify(
          c.agent === "workshop"
            ? { note: c.note, input_mode: c.input_mode ?? "typed", ...(c.hat_tag ? { hat_tag: c.hat_tag } : {}) }
            : { code: c.code, messages: c.messages },
        ),
      });
      const latency_ms = Date.now() - t0;
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const err = (body.error as { code?: string } | undefined)?.code ?? `http_${res.status}`;
        rows.push({ id: c.id, pass: false, checks: [{ name: "http ok", ok: false, detail: err }], tools: null, latency_ms, cost_usd: null, request_id, error: err });
      } else if (c.agent === "workshop") {
        const meta = body.meta as { tool_calls?: number; cost_usd?: number } | undefined;
        const stats = meta ? { tools: meta.tool_calls ?? null, cost: meta.cost_usd ?? null } : await runStats(restBase, serviceKey, request_id);
        const checks = scoreWorkshop(c, body as Parameters<typeof scoreWorkshop>[1], stats.tools);
        rows.push({ id: c.id, pass: checks.every((x) => x.ok), checks, tools: stats.tools, latency_ms, cost_usd: stats.cost, request_id });
      } else {
        const checks = scoreConcierge(c, body as Parameters<typeof scoreConcierge>[1]);
        const stats = await runStats(restBase, serviceKey, request_id);
        rows.push({ id: c.id, pass: checks.every((x) => x.ok), checks, tools: null, latency_ms, cost_usd: stats.cost, request_id });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      rows.push({ id: c.id, pass: false, checks: [{ name: "request", ok: false, detail: msg }], tools: null, latency_ms: Date.now() - t0, cost_usd: null, request_id, error: "network" });
    }
    await sleep(1000);
  }

  console.log(formatEvalTable(rows));
  const failed = rows.filter((r) => !r.skipped && !r.pass);
  if (failed.length) console.log(`\nInspect a failure with: npm run logs -- --request ${failed[0].request_id}`);

  const outDir = join(here, "results");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "latest.json"), JSON.stringify({ ran_at: new Date().toISOString(), target, rows }, null, 2) + "\n");

  const ran = rows.filter((r) => !r.skipped);
  const rate = ran.length ? ran.filter((r) => r.pass).length / ran.length : 0;
  const min = Number(flag("--min") ?? "0");
  return rate >= min ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error(`eval: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
