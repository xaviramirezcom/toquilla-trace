import "server-only";
// Admin reads for the Agent runs pages. User session: RLS (is_admin()) returns nothing to members.
import { isValidCode } from "@domain/domain";
import { tryGetSupabaseServerClient } from "@/lib/supabase/server";
import type { ProposalRow, RunListItem, RunRow } from "./runs";

export type { RunListItem };

const RUN_COLS =
  "id, agent, user_id, hat_code, input, input_mode, status, steps, summary, model, tokens_in, tokens_out, latency_ms, cost_usd, request_id, error, created_at";


async function names(ids: (string | null)[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))] as string[];
  if (!unique.length) return out;
  const supabase = await tryGetSupabaseServerClient();
  const { data } = (await supabase?.from("profiles").select("id, name").in("id", unique)) ?? { data: null };
  for (const p of (data ?? []) as { id: string; name: string | null }[]) if (p.name) out.set(p.id, p.name);
  return out;
}

export async function listRuns(opts: { hat?: string; sinceIso: string }): Promise<RunListItem[]> {
  const supabase = await tryGetSupabaseServerClient();
  if (!supabase) return [];
  let q = supabase.from("agent_runs").select(RUN_COLS).gte("created_at", opts.sinceIso).order("created_at", { ascending: false }).limit(200);
  // The code is validated first, so it is safe inside the or() filter.
  if (opts.hat && isValidCode(opts.hat)) q = q.or(`hat_code.eq.${opts.hat},input.ilike.*${opts.hat}*`);
  const { data, error } = await q;
  if (error) throw new Error(`agent runs: ${error.message}`);
  const runs = (data ?? []) as unknown as RunRow[];
  if (!runs.length) return [];

  const [{ data: props }, people] = await Promise.all([
    supabase.from("proposals").select("run_id, status").in("run_id", runs.map((r) => r.id)),
    names(runs.map((r) => r.user_id)),
  ]);
  const byRun = new Map<string, string[]>();
  for (const p of (props ?? []) as { run_id: string; status: string }[]) {
    byRun.set(p.run_id, [...(byRun.get(p.run_id) ?? []), p.status]);
  }
  return runs.map((r) => ({
    ...r,
    user_name: r.user_id ? (people.get(r.user_id) ?? null) : null,
    proposal_statuses: byRun.get(r.id) ?? [],
  }));
}

export async function getRun(id: string): Promise<{ run: RunListItem; proposals: ProposalRow[] } | null> {
  const supabase = await tryGetSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("agent_runs").select(RUN_COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(`agent run: ${error.message}`);
  if (!data) return null;
  const run = data as unknown as RunRow;
  const { data: props } = await supabase
    .from("proposals")
    .select("id, run_id, type, status, payload, edits, why, quote, confidence, edited, decided_by, decided_at, created_at")
    .eq("run_id", id)
    .order("created_at", { ascending: true });
  const proposals = (props ?? []) as unknown as ProposalRow[];
  const people = await names([run.user_id, ...proposals.map((p) => p.decided_by)]);
  return {
    run: {
      ...run,
      user_name: run.user_id ? (people.get(run.user_id) ?? null) : null,
      proposal_statuses: proposals.map((p) => p.status),
    },
    proposals: proposals.map((p) => ({ ...p, decider_name: p.decided_by ? (people.get(p.decided_by) ?? null) : null })),
  };
}
