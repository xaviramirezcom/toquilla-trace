"use client";

// Browser calls for the Workshop page: the two Edge Functions (conventions section 4), the
// restore RPC (D4) and read-only selects under RLS. Every call carries an x-request-id.
import { FunctionsHttpError } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/env";
import { log } from "@/lib/log";
import { tryGetSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AgentRequest } from "@/lib/voice/reducer";
import { SEND_TIMEOUT_MS } from "@/lib/voice/reducer";
import type { AgentMeta } from "./format";
import { OPEN_DB_STATUSES, type ApplyResult, type Edits, type ProposalRow } from "./proposals";

export interface AgentResponse {
  run_id: string;
  summary: string;
  proposals: ProposalRow[];
  meta?: AgentMeta | null;
}

export interface CallError {
  code: string;
  message: string;
  requestId: string;
  runId?: string;
  status?: number;
}

export type CallResult<T> = { ok: true; data: T } | { ok: false; error: CallError };

async function readErrorBody(err: unknown, requestId: string): Promise<CallError> {
  if (err instanceof FunctionsHttpError) {
    const res = err.context as Response | undefined;
    let body: { error?: { code?: string; message?: string; request_id?: string; run_id?: string }; run_id?: string } | null =
      null;
    try {
      body = res ? await res.clone().json() : null;
    } catch {
      body = null;
    }
    const status = res?.status;
    return {
      code: body?.error?.code ?? (status === 401 ? "unauthorized" : status === 429 ? "rate_limited" : "internal"),
      message: body?.error?.message ?? "Request failed.",
      requestId: body?.error?.request_id ?? requestId,
      runId: body?.run_id ?? body?.error?.run_id,
      status,
    };
  }
  return { code: "network", message: "Couldn't reach the server.", requestId };
}

/** POST workshop-agent. `signal` is the Stop button; a 60 s timeout is added here. */
export async function callWorkshopAgent(
  request: AgentRequest,
  requestId: string,
  signal: AbortSignal,
): Promise<CallResult<AgentResponse> | { ok: false; aborted: true }> {
  const supabase = tryGetSupabaseBrowserClient();
  if (!supabase) return { ok: false, error: { code: "not_configured", message: "Supabase is not configured.", requestId } };
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), SEND_TIMEOUT_MS);
  const onStop = () => timeout.abort();
  signal.addEventListener("abort", onStop);
  try {
    const { data, error } = await supabase.functions.invoke<AgentResponse>("workshop-agent", {
      body: request,
      headers: { "x-request-id": requestId },
      signal: timeout.signal,
    });
    if (signal.aborted) return { ok: false, aborted: true };
    if (error) {
      if (timeout.signal.aborted) return { ok: false, error: { code: "timeout", message: "The assistant took too long.", requestId } };
      return { ok: false, error: await readErrorBody(error, requestId) };
    }
    if (!data || !Array.isArray(data.proposals)) {
      return { ok: false, error: { code: "bad_response", message: "Unexpected response.", requestId } };
    }
    return { ok: true, data };
  } catch {
    if (signal.aborted) return { ok: false, aborted: true };
    if (timeout.signal.aborted) return { ok: false, error: { code: "timeout", message: "The assistant took too long.", requestId } };
    return { ok: false, error: { code: "network", message: "Couldn't reach the server.", requestId } };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onStop);
  }
}

export interface Decision {
  proposal_id: string;
  action: "approve" | "reject";
  edits?: Edits;
}

export async function callApplyProposals(
  decisions: Decision[],
  requestId: string,
): Promise<CallResult<{ results: ApplyResult[] }>> {
  const supabase = tryGetSupabaseBrowserClient();
  if (!supabase) return { ok: false, error: { code: "not_configured", message: "Supabase is not configured.", requestId } };
  try {
    const { data, error } = await supabase.functions.invoke<{ results: ApplyResult[] }>("apply-proposals", {
      body: { decisions },
      headers: { "x-request-id": requestId },
    });
    if (error) return { ok: false, error: await readErrorBody(error, requestId) };
    if (!data || !Array.isArray(data.results)) {
      return { ok: false, error: { code: "bad_response", message: "Unexpected response.", requestId } };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: { code: "network", message: "Couldn't reach the server.", requestId } };
  }
}

/**
 * Fire-and-forget flush used on pagehide / hidden tab (D14): `fetch` with keepalive survives the
 * page closing, which supabase.functions.invoke can't promise. The server is idempotent.
 */
export function flushApplyKeepalive(decisions: Decision[], requestId: string, accessToken: string | null): void {
  const env = getSupabaseEnv();
  if (!env || !accessToken || decisions.length === 0) return;
  try {
    void fetch(`${env.url}/functions/v1/apply-proposals`, {
      method: "POST",
      keepalive: true,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        apikey: env.anonKey,
        "x-request-id": requestId,
      },
      body: JSON.stringify({ decisions }),
    }).catch(() => undefined);
  } catch {
    // The page is going away; the card is pending again on reload (spec 04 open question 11).
  }
}

/** Restore a rejected or dismissed card (D4): `restore_proposal(p_id, p_status)` from migration 3. */
export async function restoreProposal(id: string, status: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = tryGetSupabaseBrowserClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };
  const { error } = await supabase.rpc("restore_proposal", { p_id: id, p_status: status });
  return error ? { ok: false, message: error.message } : { ok: true };
}

const PROPOSAL_COLUMNS = "id, run_id, type, status, payload, why, quote, confidence, rule_result, edited, edits, created_at";

export async function loadOpenProposals(workshopId: string | null): Promise<CallResult<ProposalRow[]>> {
  const supabase = tryGetSupabaseBrowserClient();
  // A plain select has no x-request-id, so errors carry an empty one.
  if (!supabase) return { ok: false, error: { code: "not_configured", message: "Supabase is not configured.", requestId: "" } };
  let q = supabase
    .from("proposals")
    .select(PROPOSAL_COLUMNS)
    .in("status", OPEN_DB_STATUSES)
    .order("created_at", { ascending: false })
    .limit(50);
  if (workshopId) q = q.eq("workshop_id", workshopId);
  const { data, error } = await q;
  if (error) return { ok: false, error: { code: error.code ?? "db_error", message: error.message, requestId: "" } };
  return { ok: true, data: (data ?? []) as unknown as ProposalRow[] };
}

/** Fresh rule results for proposals that came back blocked from apply-proposals (for the fix button). */
export async function loadRuleResults(ids: string[]): Promise<Map<string, Record<string, unknown> | null>> {
  const out = new Map<string, Record<string, unknown> | null>();
  const supabase = tryGetSupabaseBrowserClient();
  if (!supabase || ids.length === 0) return out;
  const { data, error } = await supabase.from("proposals").select("id, rule_result").in("id", ids);
  // Without the rule result the card stays blocked with its message, just without the fix button.
  if (error) log.warn("ui.error", { payload: { where: "proposals.rule_results", code: error.code } });
  for (const r of (data ?? []) as { id: string; rule_result: Record<string, unknown> | null }[]) out.set(r.id, r.rule_result);
  return out;
}

/** Refresh and retry: read the hat's current version so the decision carries `expected_version`. */
export async function readHatVersion(hatId: string): Promise<{ stage: number; version: number } | null> {
  const supabase = tryGetSupabaseBrowserClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("hats").select("stage, version").eq("id", hatId).maybeSingle();
  if (error || !data) return null;
  return data as { stage: number; version: number };
}

export async function currentAccessToken(): Promise<string | null> {
  const supabase = tryGetSupabaseBrowserClient();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export interface WeaverOption {
  id: string;
  name: string;
  village: string | null;
}

/** Weavers for the edit form's select. `null` means the load failed (the form says so). */
export async function loadWeavers(workshopId: string | null): Promise<WeaverOption[] | null> {
  const supabase = tryGetSupabaseBrowserClient();
  if (!supabase) return null;
  let q = supabase.from("weavers").select("id, name, village").order("name");
  if (workshopId) q = q.eq("workshop_id", workshopId);
  const { data, error } = await q;
  if (error) {
    log.warn("ui.error", { payload: { where: "weavers.load", code: error.code } });
    return null;
  }
  return (data ?? []) as WeaverOption[];
}
