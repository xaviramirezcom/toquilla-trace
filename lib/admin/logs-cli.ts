// Pure parts of `npm run logs` (spec 09 section 6.7): argument parsing, PostgREST query building and
// table formatting. No network and no env here, so it is unit tested (tests/logs-script.test.ts).
import { redact, type LogLevel } from "@domain/log-format";
import { RANGE_MS } from "@/lib/admin/logs";

export const CLI_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];
/** Same ranges as the Logs page filter. */
export const CLI_SINCE = RANGE_MS;
export type CliSince = keyof typeof CLI_SINCE;
export const MAX_LIMIT = 500;

export interface LogsArgs {
  levels: LogLevel[];
  since: CliSince;
  request: string | null;
  run: string | null;
  action: string | null;
  source: string | null;
  hat: string | null;
  limit: number;
  json: boolean;
  cost: boolean;
  help: boolean;
}

export const DEFAULT_ARGS: LogsArgs = {
  levels: [],
  since: "1h",
  request: null,
  run: null,
  action: null,
  source: null,
  hat: null,
  limit: 50,
  json: false,
  cost: false,
  help: false,
};

export const USAGE = `Usage: npm run logs -- [options]

  --level <l>[,<l>]   debug, info, warn, error (default: all)
  --since <range>     15m, 1h, 24h, 7d (default: 1h)
  --request <req_id>  every row of one request, oldest first
  --run <uuid>        rows for one agent run, plus its steps summary
  --action <prefix>   e.g. agent. or proposal.approve
  --source <s>        e.g. web, edge:workshop-agent
  --hat <code>        rows for one hat, e.g. TQ-7F3K2
  --limit <n>         max rows (default 50, cap ${MAX_LIMIT})
  --json              one JSON object per line
  --cost              today's agent runs, tokens and cost
  --help              this text`;

const SAFE_VALUE = /^[\w.:@-]+$/;
const VALUE_FLAGS = ["--level", "--since", "--request", "--run", "--action", "--source", "--hat", "--limit"];

export type ParseResult = { ok: true; args: LogsArgs } | { ok: false; error: string };

/** Parses `--flag value` and `--flag=value`. Values are restricted to safe characters. */
export function parseLogsArgs(argv: readonly string[]): ParseResult {
  const args: LogsArgs = { ...DEFAULT_ARGS, levels: [] };
  for (let i = 0; i < argv.length; i++) {
    let flag = argv[i];
    let value: string | undefined;
    const eq = flag.indexOf("=");
    if (flag.startsWith("--") && eq > 0) {
      value = flag.slice(eq + 1);
      flag = flag.slice(0, eq);
    }
    if (flag === "--json") args.json = true;
    else if (flag === "--cost") args.cost = true;
    else if (flag === "--help" || flag === "-h") args.help = true;
    else if (VALUE_FLAGS.includes(flag)) {
      if (value === undefined) {
        value = argv[i + 1];
        i++;
      }
      if (value === undefined || value === "" || value.startsWith("--")) return { ok: false, error: `${flag} needs a value.` };
      if (!SAFE_VALUE.test(value.replace(/,/g, ""))) return { ok: false, error: `${flag} has characters that aren't allowed.` };
      switch (flag) {
        case "--level": {
          const levels = value.split(",").map((l) => l.trim().toLowerCase());
          const bad = levels.find((l) => !(CLI_LEVELS as string[]).includes(l));
          if (bad) return { ok: false, error: `Unknown level "${bad}". Use ${CLI_LEVELS.join(", ")}.` };
          args.levels = levels as LogLevel[];
          break;
        }
        case "--since":
          if (!(value in CLI_SINCE)) return { ok: false, error: `--since must be one of ${Object.keys(CLI_SINCE).join(", ")}.` };
          args.since = value as CliSince;
          break;
        case "--limit": {
          const n = Number(value);
          if (!Number.isInteger(n) || n < 1) return { ok: false, error: "--limit must be a positive whole number." };
          args.limit = Math.min(n, MAX_LIMIT);
          break;
        }
        case "--request":
          args.request = value;
          break;
        case "--run":
          args.run = value;
          break;
        case "--action":
          args.action = value;
          break;
        case "--source":
          args.source = value;
          break;
        case "--hat":
          args.hat = value.toUpperCase();
          break;
      }
    } else {
      return { ok: false, error: `Unknown option "${flag}". Run npm run logs -- --help.` };
    }
  }
  return { ok: true, args };
}

export const LOG_SELECT = "id,created_at,level,source,action,message,user_id,request_id,hat_code,run_id,duration_ms,payload,error";

/**
 * The PostgREST path and query for app_logs. A request or run id shows the whole story
 * (oldest first, no time window); everything else is newest first inside --since.
 */
export function buildLogsQuery(args: LogsArgs, now: Date): string {
  const p = new URLSearchParams();
  p.set("select", LOG_SELECT);
  const story = Boolean(args.request || args.run);
  if (!story) p.append("created_at", `gte.${new Date(now.getTime() - CLI_SINCE[args.since]).toISOString()}`);
  if (args.levels.length) p.append("level", `in.(${args.levels.join(",")})`);
  if (args.request) p.append("request_id", `eq.${args.request}`);
  if (args.run) p.append("run_id", `eq.${args.run}`);
  if (args.action) p.append("action", `like.${args.action}*`);
  if (args.source) p.append("source", `eq.${args.source}`);
  if (args.hat) p.append("hat_code", `eq.${args.hat}`);
  p.set("order", story ? "created_at.asc,id.asc" : "created_at.desc,id.desc");
  p.set("limit", String(args.limit));
  return `/rest/v1/app_logs?${p.toString()}`;
}

export function buildRunQuery(runId: string): string {
  const p = new URLSearchParams({
    select: "id,agent,status,steps,tokens_in,tokens_out,latency_ms,cost_usd,model,request_id,error,created_at",
    id: `eq.${runId}`,
  });
  return `/rest/v1/agent_runs?${p.toString()}`;
}

export function buildCostQuery(now: Date): string {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const p = new URLSearchParams({ select: "agent,status,tokens_in,tokens_out,latency_ms,cost_usd" });
  p.append("created_at", `gte.${start}`);
  p.set("limit", "1000");
  return `/rest/v1/agent_runs?${p.toString()}`;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface CliLogRow {
  id?: number;
  created_at: string;
  level: string;
  source: string;
  action: string;
  message: string | null;
  request_id: string | null;
  duration_ms: number | null;
  hat_code?: string | null;
  run_id?: string | null;
  payload?: unknown;
  error?: { message?: string; stack?: string } | null;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function cliTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().replace("T", " ").slice(5, 23);
}

/** Compact table: time level source action ms req message, then error and 5 stack lines for warn/error. */
export function formatLogsTable(rows: readonly CliLogRow[], opts: { payloads: boolean }): string {
  if (rows.length === 0) return "No log rows match.";
  const safe = redact(rows as CliLogRow[]);
  const out = [`${pad("time (UTC)", 18)}  ${pad("level", 5)}  ${pad("source", 22)}  ${pad("action", 22)}  ${pad("ms", 6)}  ${pad("req", 16)}  message`];
  for (const r of safe) {
    out.push(
      [
        pad(cliTime(r.created_at), 18),
        pad(r.level, 5),
        pad(r.source, 22),
        pad(r.action, 22),
        pad(r.duration_ms === null || r.duration_ms === undefined ? "" : String(r.duration_ms), 6),
        pad(r.request_id ?? "", 16),
        (r.message ?? "").replace(/\s+/g, " ").slice(0, 160),
      ].join("  "),
    );
    if ((r.level === "warn" || r.level === "error") && r.error) {
      if (r.error.message) out.push(`    error: ${r.error.message}`);
      if (r.error.stack) for (const line of r.error.stack.split("\n").slice(0, 5)) out.push(`      ${line.trim()}`);
    }
    if (opts.payloads && r.payload && Object.keys(r.payload as object).length) {
      out.push(`    payload: ${JSON.stringify(r.payload)}`);
    }
  }
  return out.join("\n");
}

export function formatJsonLines(rows: readonly unknown[]): string {
  return redact(rows as unknown[])
    .map((r) => JSON.stringify(r))
    .join("\n");
}

export interface CostRow {
  agent: string;
  status: string;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  cost_usd: number | string | null;
}

export function formatCostSummary(rows: readonly CostRow[]): string {
  if (rows.length === 0) return "No agent runs today (UTC).";
  const by = new Map<string, { runs: number; failed: number; tin: number; tout: number; usd: number; lat: number[] }>();
  for (const r of rows) {
    const s = by.get(r.agent) ?? { runs: 0, failed: 0, tin: 0, tout: 0, usd: 0, lat: [] };
    s.runs++;
    if (r.status === "failed" || r.status === "stopped") s.failed++;
    s.tin += r.tokens_in ?? 0;
    s.tout += r.tokens_out ?? 0;
    s.usd += Number(r.cost_usd ?? 0) || 0;
    if (typeof r.latency_ms === "number") s.lat.push(r.latency_ms);
    by.set(r.agent, s);
  }
  const lines = [`${pad("agent", 10)}  ${pad("runs", 5)}  ${pad("failed", 6)}  ${pad("tokens in", 10)}  ${pad("tokens out", 10)}  ${pad("avg s", 6)}  cost`];
  let total = 0;
  for (const [agent, s] of by) {
    total += s.usd;
    const avg = s.lat.length ? (s.lat.reduce((a, b) => a + b, 0) / s.lat.length / 1000).toFixed(1) : "n/a";
    lines.push(
      `${pad(agent, 10)}  ${pad(String(s.runs), 5)}  ${pad(String(s.failed), 6)}  ${pad(String(s.tin), 10)}  ${pad(String(s.tout), 10)}  ${pad(avg, 6)}  $${s.usd.toFixed(4)}`,
    );
  }
  lines.push(`total today: $${total.toFixed(4)}`);
  return lines.join("\n");
}

export interface RunSummaryRow {
  id: string;
  agent: string;
  status: string;
  steps: unknown;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  cost_usd: number | string | null;
  model: string | null;
}

/** One line per step for --run. */
export function formatRunSteps(run: RunSummaryRow): string {
  const steps = Array.isArray(run.steps) ? (run.steps as Record<string, unknown>[]) : [];
  const head = `run ${run.id}  ${run.agent}  ${run.status}  ${run.model ?? ""}  ${run.tokens_in ?? 0}/${run.tokens_out ?? 0} tok  ${run.latency_ms ?? "?"} ms  $${Number(run.cost_usd ?? 0).toFixed(4)}`;
  const lines = steps.map((s, i) => {
    const kind = String(s.kind ?? "?");
    let detail = "";
    if (kind === "model_call") detail = `${s.tokens_in ?? 0}/${s.tokens_out ?? 0} tok stop=${s.stop_reason ?? "?"}`;
    else if (kind === "tool_call") detail = `${s.name ?? "?"}${s.is_error ? " ERROR" : ""}`;
    else if (kind === "rule_check") detail = `${s.allowed ? "allowed" : "BLOCKED"} ${s.rule ?? ""}: ${s.reason ?? ""}`;
    else if (kind === "proposal") detail = `${s.type ?? ""} ${s.status ?? ""}: ${s.summary ?? ""}`;
    else if (kind === "error") detail = `${s.code ?? ""}: ${s.message ?? ""}`;
    return `  ${String(i + 1).padStart(2)}. ${pad(kind, 11)} ${String(redact(detail)).slice(0, 160)}`;
  });
  return [head, ...lines].join("\n");
}
