// Eval scoring used by evals/run.ts (lib/admin/eval-score.ts), spec 10 section 6.2.
import { describe, expect, it } from "vitest";
import {
  filterCases,
  formatEvalTable,
  matchProposals,
  scoreConcierge,
  scoreWorkshop,
  type ConciergeCase,
  type WorkshopCase,
} from "@/lib/admin/eval-score";

const note = "El TQ-E7F3K ya está lavado, pasa a blanqueo. El TQ-E2C5P ya está listo.";
const wcase: WorkshopCase = {
  id: "c1",
  agent: "workshop",
  note,
  expect: {
    proposals: [
      { type: "advance_stage", status: "pending", payload: { hat_code: "TQ-E7F3K", to_stage: 2 } },
      { type: "advance_stage", status: "blocked", payload: { hat_code: "tq-e2c5p" } },
    ],
    allow_extra: false,
    quote_required: true,
    max_tool_calls: 10,
  },
  tags: ["canonical"],
};

describe("scoreWorkshop", () => {
  const good = [
    { type: "advance_stage", status: "blocked", payload: { hat_code: "TQ-E2C5P" }, quote: "El TQ-E2C5P ya está listo" },
    { type: "advance_stage", status: "pending", payload: { hat_code: "TQ-E7F3K", to_stage: 2 }, quote: "ya esta lavado, pasa a blanqueo" },
  ];
  it("passes when every expected proposal matches one to one with real quotes", () => {
    const checks = scoreWorkshop(wcase, { proposals: good }, 6);
    expect(checks.every((c) => c.ok)).toBe(true);
  });
  it("fails on a wrong status with a readable detail", () => {
    const checks = scoreWorkshop(wcase, { proposals: [good[0], { ...good[1], status: "question" }] }, null);
    const bad = checks.filter((c) => !c.ok);
    expect(bad[0].detail).toContain("expected pending");
  });
  it("fails on extra proposals, invented quotes and too many tool calls", () => {
    const extra = [...good, { type: "flag_issue", status: "pending", payload: {}, quote: "not in the note at all" }];
    const checks = scoreWorkshop(wcase, { proposals: extra }, 12);
    const failed = checks.filter((c) => !c.ok).map((c) => c.name);
    expect(failed).toContain("no extra proposals");
    expect(failed).toContain("quotes appear in the note");
    expect(failed).toContain("tool calls <= 10");
  });
  it("skips the tool check when the count is unknown (members get no meta)", () => {
    const checks = scoreWorkshop(wcase, { proposals: good }, null);
    expect(checks.some((c) => c.name.startsWith("tool calls"))).toBe(false);
  });
  it("matches one to one, so one actual can't satisfy two expected", () => {
    const exp = [{ type: "flag_issue" }, { type: "flag_issue" }];
    expect(matchProposals(exp, [{ type: "flag_issue" }])).toBeNull();
    expect(matchProposals(exp, [{ type: "flag_issue" }, { type: "flag_issue" }])).toEqual([0, 1]);
  });
});

describe("scoreConcierge", () => {
  const c: ConciergeCase = {
    id: "k1",
    agent: "concierge",
    code: "TQ-E9AHM",
    messages: [{ role: "user", content: "Who wove this hat?" }],
    expect: { refused: false, answer_includes: ["Manuel"], answer_excludes: ["transferred"], sources_kinds: ["record"] },
  };
  it("checks refusal, includes, excludes and source kinds", () => {
    expect(scoreConcierge(c, { answer: "Woven by Manuel Delgado.", refused: false, sources: [{ kind: "record" }] }).every((x) => x.ok)).toBe(true);
    const bad = scoreConcierge(c, { answer: "It was transferred to you.", refused: true, sources: [] }).filter((x) => !x.ok);
    expect(bad).toHaveLength(4);
  });
});

describe("runner helpers", () => {
  it("filters by id and tag", () => {
    const cases = [wcase, { ...wcase, id: "c2", tags: ["safety"] }];
    expect(filterCases(cases, "c2", null).map((c) => c.id)).toEqual(["c2"]);
    expect(filterCases(cases, null, "canonical").map((c) => c.id)).toEqual(["c1"]);
    expect(filterCases(cases, null, null)).toHaveLength(2);
  });
  it("prints the table with pass rate, total cost and skips", () => {
    const out = formatEvalTable([
      { id: "c1", pass: true, checks: [{ name: "a", ok: true }], tools: 6, latency_ms: 9800, cost_usd: 0.002, request_id: "req_3a9f01c2d4e5" },
      { id: "c2", pass: false, checks: [{ name: "b", ok: false, detail: "no flag_issue proposal" }], tools: null, latency_ms: 5000, cost_usd: null, request_id: "req_aaaaaaaaaaaa" },
      { id: "c3", pass: false, checks: [], tools: null, latency_ms: 0, cost_usd: null, request_id: "req_bbbbbbbbbbbb", skipped: "no eval user" },
    ]);
    expect(out).toContain("PASS");
    expect(out).toContain("no flag_issue proposal");
    expect(out).toContain("SKIP");
    expect(out).toContain("1/2 passed (50%)");
    expect(out).toContain("1 skipped");
  });
});
