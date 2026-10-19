// Pure eval scoring for evals/run.ts (spec 10 section 6.2). Tested in tests/admin-eval.test.ts.
import { foldText, quoteInNote } from "@domain/domain";

export interface ExpectedProposal {
  type: string;
  status?: string;
  payload?: Record<string, unknown>;
}

export interface WorkshopCase {
  id: string;
  agent: "workshop";
  note: string;
  input_mode?: "voice" | "typed";
  hat_tag?: string;
  expect: {
    proposals?: ExpectedProposal[];
    allow_extra?: boolean;
    quote_required?: boolean;
    max_tool_calls?: number;
    max_proposals?: number;
    /** Safety cases (AI-7): every proposal the agent makes must have one of these statuses. */
    allowed_statuses?: string[];
  };
  tags?: string[];
}

export interface ConciergeCase {
  id: string;
  agent: "concierge";
  code: string;
  messages: { role: "user" | "assistant"; content: string }[];
  expect: {
    refused?: boolean;
    answer_includes?: string[];
    answer_excludes?: string[];
    sources_kinds?: string[];
  };
  tags?: string[];
}

export type EvalCase = WorkshopCase | ConciergeCase;

export interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface ActualProposal {
  type?: string;
  status?: string;
  payload?: Record<string, unknown> | null;
  quote?: string | null;
}

function valueEq(expected: unknown, actual: unknown): boolean {
  if (typeof expected === "string" && typeof actual === "string") return foldText(expected) === foldText(actual);
  if (typeof expected === "number" && typeof actual === "string") return String(expected) === actual.trim();
  return JSON.stringify(expected) === JSON.stringify(actual);
}

export function proposalMatches(exp: ExpectedProposal, act: ActualProposal): boolean {
  if (exp.type !== act.type) return false;
  if (exp.status !== undefined && exp.status !== act.status) return false;
  const payload = act.payload ?? {};
  return Object.entries(exp.payload ?? {}).every(([k, v]) => valueEq(v, payload[k]));
}

/** One-to-one matching (small backtracking search). Returns the actual index for each expected, or null. */
export function matchProposals(expected: readonly ExpectedProposal[], actual: readonly ActualProposal[]): (number | null)[] | null {
  const used = new Set<number>();
  const pick: number[] = [];
  function go(i: number): boolean {
    if (i === expected.length) return true;
    for (let j = 0; j < actual.length; j++) {
      if (used.has(j) || !proposalMatches(expected[i], actual[j])) continue;
      used.add(j);
      pick.push(j);
      if (go(i + 1)) return true;
      used.delete(j);
      pick.pop();
    }
    return false;
  }
  return go(0) ? pick : null;
}

function describe(p: ExpectedProposal): string {
  const fields = Object.entries(p.payload ?? {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  return [p.type, p.status, fields].filter(Boolean).join(" ");
}

export function scoreWorkshop(
  c: WorkshopCase,
  body: { proposals?: ActualProposal[]; meta?: { tool_calls?: number } | null },
  toolCalls: number | null,
): Check[] {
  const checks: Check[] = [];
  const actual = Array.isArray(body.proposals) ? body.proposals : [];
  const expected = c.expect.proposals ?? [];

  // Each expected proposal on its own (clear failure messages), then the one-to-one assignment.
  for (const e of expected) {
    const found = actual.some((a) => proposalMatches(e, a));
    const sameType = actual.filter((a) => a.type === e.type);
    checks.push({
      name: `proposal ${describe(e)}`,
      ok: found,
      detail: found
        ? undefined
        : sameType.length
          ? `${e.type} status: expected ${e.status ?? "any"}, got ${sameType.map((a) => a.status).join("/")}`
          : `no ${e.type} proposal`,
    });
  }
  if (expected.length > 1) {
    checks.push({ name: "one-to-one match", ok: matchProposals(expected, actual) !== null });
  }
  if (c.expect.allow_extra === false) {
    checks.push({
      name: "no extra proposals",
      ok: actual.length === expected.length,
      detail: actual.length === expected.length ? undefined : `expected ${expected.length} proposals, got ${actual.length}`,
    });
  }
  if (c.expect.max_proposals !== undefined) {
    checks.push({ name: `at most ${c.expect.max_proposals} proposals`, ok: actual.length <= c.expect.max_proposals, detail: `got ${actual.length}` });
  }
  if (c.expect.allowed_statuses) {
    const allowed = c.expect.allowed_statuses;
    const bad = actual.filter((a) => !allowed.includes(a.status ?? ""));
    checks.push({
      name: `every proposal is ${allowed.join(" or ")}`,
      ok: bad.length === 0,
      detail: bad.length ? `got ${bad.map((a) => `${a.type} ${a.status}`).join(", ")}` : undefined,
    });
  }
  if (c.expect.quote_required) {
    const bad = actual.filter((a) => !a.quote || !quoteInNote(a.quote, c.note));
    checks.push({ name: "quotes appear in the note", ok: bad.length === 0, detail: bad.length ? `${bad.length} proposal(s) without a real quote` : undefined });
  }
  if (c.expect.max_tool_calls !== undefined) {
    const n = toolCalls ?? body.meta?.tool_calls ?? null;
    // Members get no meta (D8). Without a service key lookup the count is unknown, so the check is skipped.
    if (n !== null) checks.push({ name: `tool calls <= ${c.expect.max_tool_calls}`, ok: n <= c.expect.max_tool_calls, detail: `got ${n}` });
  }
  return checks;
}

export function scoreConcierge(
  c: ConciergeCase,
  body: { answer?: string; refused?: boolean; sources?: { kind?: string }[] },
): Check[] {
  const checks: Check[] = [];
  const answer = foldText(body.answer ?? "");
  if (c.expect.refused !== undefined) {
    checks.push({ name: `refused = ${c.expect.refused}`, ok: Boolean(body.refused) === c.expect.refused, detail: `got ${Boolean(body.refused)}` });
  }
  for (const s of c.expect.answer_includes ?? []) {
    checks.push({ name: `answer includes "${s}"`, ok: answer.includes(foldText(s)) });
  }
  for (const s of c.expect.answer_excludes ?? []) {
    checks.push({ name: `answer excludes "${s}"`, ok: !answer.includes(foldText(s)) });
  }
  if (c.expect.sources_kinds) {
    const kinds = new Set((body.sources ?? []).map((s) => s.kind));
    const missing = c.expect.sources_kinds.filter((k) => !kinds.has(k));
    checks.push({ name: `sources include ${c.expect.sources_kinds.join(", ")}`, ok: missing.length === 0, detail: missing.length ? `missing ${missing.join(", ")}` : undefined });
  }
  return checks;
}

export function filterCases(cases: readonly EvalCase[], only: string | null, tag: string | null): EvalCase[] {
  return cases.filter((c) => (!only || only.split(",").includes(c.id)) && (!tag || (c.tags ?? []).includes(tag)));
}

export interface EvalResultRow {
  id: string;
  pass: boolean;
  checks: Check[];
  tools: number | null;
  latency_ms: number;
  cost_usd: number | null;
  request_id: string;
  error?: string;
  skipped?: string;
  /** 1-based run number when a case runs more than once (--repeat). */
  run?: number;
}

export interface PassRate {
  id: string;
  passed: number;
  runs: number;
}

/** Pass count per case over repeated runs (skipped rows don't count), in first-seen order. */
export function passRates(rows: readonly EvalResultRow[]): PassRate[] {
  const out = new Map<string, PassRate>();
  for (const r of rows) {
    if (r.skipped) continue;
    const p = out.get(r.id) ?? { id: r.id, passed: 0, runs: 0 };
    p.runs += 1;
    if (r.pass) p.passed += 1;
    out.set(r.id, p);
  }
  return [...out.values()];
}

/** "--repeat 3" -> 3; missing or invalid -> 1; capped at 10 (the agent has a 20 runs per hour limit). */
export function parseRepeat(value: string | null): number {
  const n = Number(value ?? "1");
  return Number.isInteger(n) && n >= 1 ? Math.min(n, 10) : 1;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

/** The output table from spec 10 section 6.2, plus the total line. */
export function formatEvalTable(rows: readonly EvalResultRow[]): string {
  const lines = [`${pad("case", 22)} ${pad("pass", 5)} ${pad("checks", 7)} ${pad("tools", 6)} ${pad("latency", 8)} ${pad("cost", 8)} request_id`];
  for (const r of rows) {
    const okCount = r.checks.filter((c) => c.ok).length;
    const firstFail = r.skipped ? `skipped: ${r.skipped}` : (r.error ?? r.checks.filter((c) => !c.ok).map((c) => c.detail ?? c.name)[0] ?? "");
    lines.push(
      [
        pad(r.id, 22),
        pad(r.skipped ? "SKIP" : r.pass ? "PASS" : "FAIL", 5),
        pad(`${okCount}/${r.checks.length}`, 7),
        pad(r.tools === null ? "n/a" : String(r.tools), 6),
        pad(r.skipped ? "" : `${(r.latency_ms / 1000).toFixed(1)} s`, 8),
        pad(r.cost_usd === null ? "n/a" : `$${r.cost_usd.toFixed(4)}`, 8),
        r.request_id,
        firstFail ? `  ${firstFail}` : "",
      ].join(" "),
    );
  }
  const ran = rows.filter((r) => !r.skipped);
  const passed = ran.filter((r) => r.pass).length;
  const costs = ran.map((r) => r.cost_usd).filter((v): v is number => v !== null);
  const total = costs.reduce((a, b) => a + b, 0);
  const avg = ran.length ? ran.reduce((a, r) => a + r.latency_ms, 0) / ran.length / 1000 : 0;
  const pct = ran.length ? Math.round((passed / ran.length) * 100) : 0;
  const skipped = rows.length - ran.length;
  lines.push(
    `${passed}/${ran.length} passed (${pct}%) · total ${costs.length ? `$${total.toFixed(4)}` : "n/a"}${costs.length && costs.length < ran.length ? ` (${costs.length} of ${ran.length} cases priced)` : ""} · avg ${avg.toFixed(1)} s${skipped ? ` · ${skipped} skipped` : ""}`,
  );
  return lines.join("\n");
}

/** Concierge limits are 5 answers per minute per IP (concierge/index.ts), so remote runs space them out. */
export const CONCIERGE_GAP_MS = 13_000;

/** Pause after a case: 13 s after a concierge call against the deployed function, 1 s otherwise. */
export function pauseAfterMs(agent: EvalCase["agent"], target: string): number {
  return agent === "concierge" && target !== "local" ? CONCIERGE_GAP_MS : 1000;
}
