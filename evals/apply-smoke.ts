// Live check of the only path that writes hats (AI-6): workshop-agent proposal -> apply-proposals ->
// apply_proposal() in SQL, as the Eval Workshop user. Resets the Eval Workshop before and after.
//
//   node --env-file=.env --import tsx evals/apply-smoke.ts
//
// Steps: (1) a note proposes TQ-E8B2N Washing -> Bleaching, approve it, check the hat row and the
// hat_events row; (2) approve the same proposal again: idempotent, nothing new written; (3) two notes
// propose the same move for TQ-E7F3K, approve the first, then the second must fail with
// version_conflict. Exit code 1 if any check fails. Never touches another workshop.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const email = process.env.EVAL_EMAIL?.trim() || "eval@test.com";
const password = process.env.EVAL_PASSWORD?.trim() || process.env.DEMO_PASSWORD?.trim() || "";

function reset(): void {
  const r = spawnSync(process.execPath, [join(here, "..", "scripts", "eval-reset.mjs")], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("eval reset failed");
}

let failures = 0;
function check(name: string, ok: boolean, detail: unknown = ""): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === "" ? "" : `  ${JSON.stringify(detail)}`}`);
}

async function main(): Promise<void> {
  if (!url || !anon || !password) throw new Error("Missing Supabase URL, anon key or eval password in .env");
  reset();
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data: auth, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !auth.session) throw new Error("eval user sign-in failed");
  const headers = { "content-type": "application/json", authorization: `Bearer ${auth.session.access_token}`, apikey: anon };

  const note = async (text: string) => {
    const res = await fetch(`${url}/functions/v1/workshop-agent`, {
      method: "POST",
      headers,
      body: JSON.stringify({ note: text, input_mode: "typed" }),
    });
    const body = (await res.json()) as { proposals?: { id: string; type: string; status: string; payload: Record<string, unknown> }[] };
    return (body.proposals ?? []).find((p) => p.type === "advance_stage" && p.status === "pending") ?? null;
  };
  const approve = async (id: string) => {
    const res = await fetch(`${url}/functions/v1/apply-proposals`, {
      method: "POST",
      headers,
      body: JSON.stringify({ decisions: [{ proposal_id: id, action: "approve" }] }),
    });
    const body = (await res.json()) as { results?: { status: string; error?: { code: string }; hat_codes?: string[] }[] };
    return body.results?.[0] ?? null;
  };
  const hat = async (code: string) => {
    const { data } = await sb.from("hats").select("id, stage, version").eq("code", code).single();
    const { count } = await sb
      .from("hat_events")
      .select("id", { count: "exact", head: true })
      .eq("hat_id", data?.id ?? "")
      .eq("type", "stage_advanced")
      .eq("to_stage", 2);
    return { stage: data?.stage, version: data?.version, events_to_bleaching: count ?? 0 };
  };

  // 1. Approve.
  const p1 = await note("El TQ-E8B2N ya está lavado, pasa a blanqueo");
  check("agent proposed a pending advance for TQ-E8B2N", p1 !== null && p1.payload.hat_code === "TQ-E8B2N", p1?.payload);
  if (!p1) return;
  const before = await hat("TQ-E8B2N");
  const r1 = await approve(p1.id);
  const after = await hat("TQ-E8B2N");
  check("approve: approved with the hat code", r1?.status === "approved" && r1.hat_codes?.[0] === "TQ-E8B2N", r1);
  check("approve: stage 1 -> 2, version +1", before.stage === 1 && after.stage === 2 && after.version === (before.version ?? 0) + 1, { before, after });
  check("approve: one stage_advanced event to Bleaching", after.events_to_bleaching === 1, after);

  // 2. Idempotent replay.
  const r2 = await approve(p1.id);
  const again = await hat("TQ-E8B2N");
  check("replay: approved again, nothing written", r2?.status === "approved" && again.version === after.version && again.events_to_bleaching === 1, { r2, again });

  // 3. Version conflict: two proposals for the same move, the second is stale after the first.
  const a = await note("El TQ-E7F3K ya está lavado, pasa a blanqueo");
  const b = await note("Confirmo: el TQ-E7F3K pasa a blanqueo");
  check("two pending proposals for TQ-E7F3K", a !== null && b !== null && a.id !== b.id, { a: a?.payload, b: b?.payload });
  if (a && b) {
    const ra = await approve(a.id);
    const rb = await approve(b.id);
    check("first approve wins", ra?.status === "approved", ra);
    check("second approve is a version conflict", rb?.status === "failed" && rb.error?.code === "version_conflict", rb);
  }
}

main()
  .catch((e: unknown) => {
    failures += 1;
    console.error(e instanceof Error ? e.message : String(e));
  })
  .finally(() => {
    try {
      reset();
    } catch {
      failures += 1;
    }
    console.log(failures === 0 ? "\nAll apply checks passed." : `\n${failures} check(s) failed.`);
    process.exitCode = failures === 0 ? 0 : 1;
  });
