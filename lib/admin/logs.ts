// Pure helpers for the Logs page (spec 09 section 4.1 and 6.5). No React, no Supabase. Tested in tests/admin.test.ts.
import type { LogLevel, LogSource, SerializedError } from "@domain/log-format";
import { REQUEST_ID_RE } from "@/lib/request-id";

export const LEVELS: readonly LogLevel[] = ["error", "warn", "info", "debug"];

export const SOURCE_LABELS: Record<LogSource, string> = {
  web: "Web app",
  "edge:workshop-agent": "Workshop agent",
  "edge:apply-proposals": "Edge function",
  "edge:concierge": "Buyer concierge",
  db: "Database",
};
export const SOURCES = Object.keys(SOURCE_LABELS) as LogSource[];

export const TIME_RANGES = { "15m": "15 min", "1h": "1 h", "24h": "24 h", "7d": "7 days" } as const;
export type TimeRange = keyof typeof TIME_RANGES;
export const DEFAULT_RANGE: TimeRange = "24h";

const RANGE_MS: Record<TimeRange, number> = {
  "15m": 15 * 60_000,
  "1h": 3_600_000,
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
};


export interface LogRowFull {
  id: number;
  created_at: string;
  level: LogLevel;
  source: LogSource;
  action: string;
  message: string | null;
  user_id: string | null;
  request_id: string | null;
  hat_code: string | null;
  run_id: string | null;
  duration_ms: number | null;
  payload: Record<string, unknown> | null;
  error: SerializedError | null;
}

export interface LogFilters {
  levels: LogLevel[];
  sources: LogSource[];
  action: string;
  since: TimeRange;
  req: string;
  hat: string;
  run: string;
  q: string;
}

export const EMPTY_LOG_FILTERS: LogFilters = {
  levels: [],
  sources: [],
  action: "",
  since: DEFAULT_RANGE,
  req: "",
  hat: "",
  run: "",
  q: "",
};

type Params = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

function list(v: string | string[] | undefined): string[] {
  const raw = Array.isArray(v) ? v : v ? [v] : [];
  return raw.flatMap((x) => x.split(",")).map((x) => x.trim()).filter(Boolean);
}

/** URL search params to filters. Unknown values are dropped, so a hand-edited URL can't break the query. */
export function parseLogFilters(params: Params): LogFilters {
  const since = first(params.since);
  return {
    levels: list(params.level).filter((l): l is LogLevel => (LEVELS as string[]).includes(l)),
    sources: list(params.source).filter((s): s is LogSource => s in SOURCE_LABELS),
    action: first(params.action).slice(0, 64),
    since: since in TIME_RANGES ? (since as TimeRange) : DEFAULT_RANGE,
    req: first(params.req).slice(0, 40),
    hat: first(params.hat).toUpperCase().slice(0, 12),
    run: first(params.run).slice(0, 40),
    q: first(params.q).slice(0, 120),
  };
}

/** Filters back to a query string (defaults omitted). `id` keeps the open row. */
export function logFiltersToQuery(f: LogFilters, id?: number | null): string {
  const p = new URLSearchParams();
  if (f.levels.length) p.set("level", f.levels.join(","));
  if (f.sources.length) p.set("source", f.sources.join(","));
  if (f.action) p.set("action", f.action);
  if (f.since !== DEFAULT_RANGE) p.set("since", f.since);
  if (f.req) p.set("req", f.req);
  if (f.hat) p.set("hat", f.hat);
  if (f.run) p.set("run", f.run);
  if (f.q) p.set("q", f.q);
  if (id) p.set("id", String(id));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function hasLogFilters(f: LogFilters): boolean {
  return logFiltersToQuery(f) !== "";
}

export function sinceIso(range: TimeRange, now: Date): string {
  return new Date(now.getTime() - RANGE_MS[range]).toISOString();
}

/** A search box value as a PostgREST filter: exact request id, or ilike on message and action. */
export function searchFilter(q: string): { kind: "request"; value: string } | { kind: "text"; or: string } | null {
  const s = q.trim();
  if (!s) return null;
  if (REQUEST_ID_RE.test(s)) return { kind: "request", value: s };
  // Characters with meaning in PostgREST or() syntax and LIKE patterns are removed.
  const safe = s.replace(/[,()*%\\:"]/g, " ").trim();
  if (!safe) return null;
  return { kind: "text", or: `message.ilike.*${safe}*,action.ilike.*${safe}*` };
}

/** "10:42:13.512" in UTC. */
export function logTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(11, 23);
}

/** "2026-10-18 10:42:13.512 UTC". */
export function logTimestamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().replace("T", " ").replace("Z", " UTC");
}

export function shortId(id: string | null | undefined, n = 10): string {
  return id ? (id.length > n ? `${id.slice(0, n)}…` : id) : "";
}

// ---------------------------------------------------------------------------
// JSON syntax highlight (tokens, rendered by components/admin/JsonView.tsx)
// ---------------------------------------------------------------------------

export type JsonTokenKind = "key" | "string" | "number" | "bool" | "null" | "punct";
export interface JsonToken {
  kind: JsonTokenKind;
  text: string;
}

const TOKEN_RE = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[^"\w-]+|[\w-]+/g;

/** Splits pretty-printed JSON into coloured tokens. Joining every token's text gives the input back. */
export function tokenizeJson(json: string): JsonToken[] {
  const out: JsonToken[] = [];
  for (const m of json.matchAll(TOKEN_RE)) {
    const [whole, str, colon, bool] = m;
    if (str !== undefined) {
      if (colon !== undefined) {
        out.push({ kind: "key", text: str }, { kind: "punct", text: colon });
      } else out.push({ kind: "string", text: str });
    } else if (bool !== undefined) out.push({ kind: "bool", text: whole });
    else if (whole === "null") out.push({ kind: "null", text: whole });
    else if (/^-?\d/.test(whole)) out.push({ kind: "number", text: whole });
    else out.push({ kind: "punct", text: whole });
  }
  return out;
}
