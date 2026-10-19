// Pure helpers for the Agent runs pages (spec 09 sections 4.2 and 5.3). Tested in tests/admin.test.ts.

export type RunStep =
  | {
      i: number;
      kind: "model_call";
      at: string;
      duration_ms?: number;
      tokens_in?: number;
      tokens_out?: number;
      cache_read?: number;
      stop_reason?: string;
      text?: string;
    }
  | {
      i: number;
      kind: "tool_call";
      at: string;
      duration_ms?: number;
      name: string;
      access?: "read" | "write_proposed" | string;
      input?: unknown;
      output?: unknown;
      is_error?: boolean;
    }
  | { i: number; kind: "rule_check"; at: string; rule?: string; allowed: boolean; reason?: string; hat_code?: string }
  | { i: number; kind: "proposal"; at: string; proposal_id?: string; type?: string; status?: string; summary?: string }
  | { i: number; kind: "error"; at: string; code?: string; message?: string; detail?: unknown };

export interface RunRow {
  id: string;
  agent: "workshop" | "concierge" | string;
  user_id: string | null;
  hat_code: string | null;
  input: string | null;
  input_mode: string | null;
  status: string;
  steps: RunStep[] | null;
  summary: string | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  cost_usd: number | null;
  request_id: string | null;
  error: unknown;
  created_at: string;
}

export interface RunListItem extends RunRow {
  user_name: string | null;
  proposal_statuses: string[];
}

export interface ProposalRow {
  id: string;
  run_id: string;
  type: string;
  status: string;
  payload: Record<string, unknown> | null;
  edits: Record<string, unknown> | null;
  why: string | null;
  quote: string | null;
  confidence: string | null;
  edited: boolean | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  decider_name?: string | null;
}

/** Steps as an array whatever the column holds (null, a non-array, or rows without `kind` are dropped). */
export function normalizeSteps(steps: unknown): RunStep[] {
  if (!Array.isArray(steps)) return [];
  return steps.filter((s): s is RunStep => !!s && typeof s === "object" && typeof (s as { kind?: unknown }).kind === "string");
}

export function toolCount(steps: unknown): number {
  return normalizeSteps(steps).filter((s) => s.kind === "tool_call").length;
}

export function ruleBlocks(steps: unknown): number {
  return normalizeSteps(steps).filter((s) => s.kind === "rule_check" && s.allowed === false).length;
}

/**
 * UI status (D3): stored workshop statuses are running, proposed, failed, stopped. "Approved",
 * "Partially approved" and "Rejected" are derived from the run's proposals once people decide.
 */
export function displayStatus(status: string, proposalStatuses: readonly string[] = []): string {
  if (status !== "proposed") return status ? status[0].toUpperCase() + status.slice(1) : "Unknown";
  const decided = proposalStatuses.filter((s) => ["approved", "rejected", "dismissed", "failed"].includes(s));
  if (proposalStatuses.length === 0 || decided.length === 0) return "Proposed";
  const approved = proposalStatuses.filter((s) => s === "approved").length;
  if (approved === proposalStatuses.length) return "Approved";
  if (approved > 0) return "Partially approved";
  if (decided.length === proposalStatuses.length) return "Rejected";
  return "Proposed";
}

export function statusTone(display: string): "ok" | "warn" | "err" | "info" | "neutral" | "accent" {
  switch (display) {
    case "Approved":
    case "Answered":
      return "ok";
    case "Partially approved":
    case "Stopped":
    case "Refused":
      return "warn";
    case "Failed":
      return "err";
    case "Proposed":
      return "accent";
    case "Running":
      return "info";
    default:
      return "neutral";
  }
}

export function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "n/a";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function formatCost(usd: number | string | null | undefined): string {
  const n = typeof usd === "string" ? Number(usd) : usd;
  if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`;
}

export interface RunSummary {
  runs: number;
  successRate: number | null;
  avgLatencyMs: number | null;
  avgCostUsd: number | null;
  ruleBlocks: number;
}

/** Summary tiles. Null latency or cost is excluded from averages (spec 09 rule 12). */
export function summarizeRuns(runs: readonly Pick<RunRow, "status" | "latency_ms" | "cost_usd" | "steps">[]): RunSummary {
  if (runs.length === 0) return { runs: 0, successRate: null, avgLatencyMs: null, avgCostUsd: null, ruleBlocks: 0 };
  const ok = runs.filter((r) => !["failed", "stopped"].includes(r.status)).length;
  const lat = runs.map((r) => r.latency_ms).filter((v): v is number => typeof v === "number");
  const cost = runs.map((r) => (r.cost_usd === null ? null : Number(r.cost_usd))).filter((v): v is number => v !== null && Number.isFinite(v));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    runs: runs.length,
    successRate: ok / runs.length,
    avgLatencyMs: avg(lat),
    avgCostUsd: avg(cost),
    ruleBlocks: runs.reduce((n, r) => n + ruleBlocks(r.steps), 0),
  };
}

export type RunDateRange = "today" | "7d" | "30d";

export function runDateStart(range: RunDateRange, now: Date): Date {
  if (range === "today") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return new Date(now.getTime() - (range === "7d" ? 7 : 30) * 86_400_000);
}

/** Steps open by default: the first two and every error (spec 09 section 4.2). */
export function defaultOpenSteps(steps: readonly RunStep[]): Set<number> {
  const open = new Set<number>();
  steps.forEach((s, idx) => {
    if (idx < 2 || s.kind === "error" || (s.kind === "tool_call" && s.is_error) || (s.kind === "rule_check" && !s.allowed)) open.add(idx);
  });
  return open;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}
