// `npm run logs` argument parsing, query building and output (lib/admin/logs-cli.ts), spec 09 section 6.7.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ARGS,
  MAX_LIMIT,
  buildCostQuery,
  buildLogsQuery,
  formatCostSummary,
  formatJsonLines,
  formatLogsTable,
  formatRunSteps,
  parseLogsArgs,
} from "@/lib/admin/logs-cli";

function args(argv: string[]) {
  const r = parseLogsArgs(argv);
  if (!r.ok) throw new Error(r.error);
  return r.args;
}

describe("parseLogsArgs", () => {
  it("uses the defaults with no flags", () => {
    expect(args([])).toEqual(DEFAULT_ARGS);
  });
  it("parses every flag, in both --flag value and --flag=value forms", () => {
    const a = args(["--level", "error,warn", "--since=24h", "--request", "req_8f2a91c4e2b7", "--action", "agent.", "--limit", "20", "--json"]);
    expect(a).toMatchObject({ levels: ["error", "warn"], since: "24h", request: "req_8f2a91c4e2b7", action: "agent.", limit: 20, json: true });
    expect(args(["--hat", "tq-7f3k2", "--source", "edge:workshop-agent", "--cost"])).toMatchObject({
      hat: "TQ-7F3K2",
      source: "edge:workshop-agent",
      cost: true,
    });
  });
  it("caps the limit at 500", () => {
    expect(args(["--limit", "9999"]).limit).toBe(MAX_LIMIT);
  });
  it("rejects bad input with a message", () => {
    expect(parseLogsArgs(["--level", "fatal"])).toMatchObject({ ok: false });
    expect(parseLogsArgs(["--since", "2h"])).toMatchObject({ ok: false });
    expect(parseLogsArgs(["--limit", "0"])).toMatchObject({ ok: false });
    expect(parseLogsArgs(["--limit"])).toMatchObject({ ok: false });
    expect(parseLogsArgs(["--request", "--json"])).toMatchObject({ ok: false });
    expect(parseLogsArgs(["--wat"])).toMatchObject({ ok: false });
    // Values can't smuggle extra PostgREST filters.
    expect(parseLogsArgs(["--request", "x&level=eq.debug"])).toMatchObject({ ok: false });
  });
});

describe("buildLogsQuery", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  it("filters by level and time window, newest first", () => {
    const q = buildLogsQuery(args(["--level", "error", "--since", "1h"]), now);
    const u = new URL(`http://x${q}`);
    expect(u.pathname).toBe("/rest/v1/app_logs");
    expect(u.searchParams.get("level")).toBe("in.(error)");
    expect(u.searchParams.get("created_at")).toBe("gte.2026-10-18T11:00:00.000Z");
    expect(u.searchParams.get("order")).toBe("created_at.desc,id.desc");
    expect(u.searchParams.get("limit")).toBe("50");
  });
  it("shows a whole request oldest first with no time window", () => {
    const u = new URL(`http://x${buildLogsQuery(args(["--request", "req_8f2a91c4e2b7"]), now)}`);
    expect(u.searchParams.get("request_id")).toBe("eq.req_8f2a91c4e2b7");
    expect(u.searchParams.get("created_at")).toBeNull();
    expect(u.searchParams.get("order")).toBe("created_at.asc,id.asc");
  });
  it("treats --action as a prefix and adds hat and source", () => {
    const u = new URL(`http://x${buildLogsQuery(args(["--action", "agent.", "--hat", "TQ-7F3K2", "--source", "web"]), now)}`);
    expect(u.searchParams.get("action")).toBe("like.agent.*");
    expect(u.searchParams.get("hat_code")).toBe("eq.TQ-7F3K2");
    expect(u.searchParams.get("source")).toBe("eq.web");
  });
  it("builds today's cost query from UTC midnight", () => {
    const u = new URL(`http://x${buildCostQuery(now)}`);
    expect(u.pathname).toBe("/rest/v1/agent_runs");
    expect(u.searchParams.get("created_at")).toBe("gte.2026-10-18T00:00:00.000Z");
  });
});

describe("output", () => {
  const row = {
    created_at: "2026-10-18T10:42:13.512Z",
    level: "error",
    source: "web",
    action: "proposal.apply_failed",
    message: "Approve failed",
    request_id: "req_8f2a91c4e2b7",
    duration_ms: 120,
    payload: { token: "secret-value", note: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc" },
    error: { message: "boom", stack: "Error: boom\n at a\n at b\n at c\n at d\n at e\n at f" },
  };
  it("prints a compact table with the error and five stack lines", () => {
    const out = formatLogsTable([row], { payloads: false });
    expect(out).toContain("proposal.apply_failed");
    expect(out).toContain("req_8f2a91c4e2b7");
    expect(out).toContain("error: boom");
    expect(out).toContain("at d");
    expect(out).not.toContain("at e");
    expect(out).not.toContain("payload:");
  });
  it("never prints secrets, even in payload mode or JSON lines", () => {
    const table = formatLogsTable([row], { payloads: true });
    const json = formatJsonLines([row]);
    for (const out of [table, json]) {
      expect(out).not.toContain("secret-value");
      expect(out).not.toContain("eyJhbGci");
      expect(out).toContain("[redacted]");
    }
  });
  it("says so when there are no rows", () => {
    expect(formatLogsTable([], { payloads: false })).toBe("No log rows match.");
  });
  it("summarizes cost per agent", () => {
    const out = formatCostSummary([
      { agent: "workshop", status: "proposed", tokens_in: 100, tokens_out: 50, latency_ms: 2000, cost_usd: 0.001 },
      { agent: "workshop", status: "failed", tokens_in: 10, tokens_out: 0, latency_ms: null, cost_usd: "0.0005" },
    ]);
    expect(out).toContain("workshop");
    expect(out).toContain("total today: $0.0015");
  });
  it("prints run steps one per line", () => {
    const out = formatRunSteps({
      id: "r1",
      agent: "workshop",
      status: "proposed",
      model: "gemini-2.5-flash-lite",
      tokens_in: 1,
      tokens_out: 2,
      latency_ms: 3,
      cost_usd: 0.0001,
      steps: [
        { kind: "tool_call", name: "find_hat", is_error: false },
        { kind: "rule_check", allowed: false, rule: "stage_order", reason: "skip" },
      ],
    });
    expect(out.split("\n")).toHaveLength(3);
    expect(out).toContain("BLOCKED stage_order: skip");
  });
});
