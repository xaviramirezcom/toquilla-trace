import { describe, expect, it } from "vitest";
import { activityText, greeting, metaRowText, relativeTime } from "@/lib/workshop/format";
import {
  answerChoice,
  applyFix,
  applyResult,
  approveAllSelection,
  approveToastText,
  cardView,
  checkDraft,
  completionText,
  editsForSubmit,
  fromRow,
  isComplete,
  isOpen,
  mergeRun,
  OPEN_DB_STATUSES,
  OPEN_STATUSES,
  rejectAllSelection,
  ruleOf,
  savedToastText,
  type Card,
  type ProposalRow,
} from "@/lib/workshop/proposals";
import { UNDO_MS, cancel, enqueue, takeDue, takeIds } from "@/lib/workshop/queue";

function row(over: Partial<ProposalRow> & Pick<ProposalRow, "id" | "type">): ProposalRow {
  return {
    status: "pending",
    payload: {},
    why: null,
    quote: null,
    confidence: "high",
    rule_result: null,
    ...over,
  };
}

const createQuestion = row({
  id: "p1",
  type: "create_hat",
  status: "question",
  confidence: "check",
  quote: "terminó 3 finos de 18 hileras",
  payload: {
    quantity: 3,
    grade: "Fino",
    rows_per_inch: 18,
    weaver_id: null,
    question: {
      text: "I found 2 weavers named Rosa. Which one?",
      choices: [
        { label: "Rosa Pillco (Sígsig)", weaver_id: "w1", hat_code: null },
        { label: "Rosa Guamán (Cuenca)", weaver_id: "w2", hat_code: null },
      ],
    },
  },
});
const advance = row({
  id: "p2",
  type: "advance_stage",
  payload: { hat_id: "h1", hat_code: "TQ-7F3K2", from_stage: 1, to_stage: 2, hat_version: 3 },
});
const blocked = row({
  id: "p3",
  type: "advance_stage",
  status: "blocked",
  payload: { hat_id: "h2", hat_code: "TQ-2C5P0", from_stage: 0, to_stage: 4 },
  rule_result: {
    allowed: false,
    code: "stage_skip",
    message: "Can't move TQ-2C5P0 from Weaving to Finished. Next allowed stage: Washing.",
    fix: { to_stage: 1 },
  },
});
const flag = row({
  id: "p4",
  type: "flag_issue",
  payload: { hat_id: "h3", hat_code: "TQ-4K9D1", kind: "grade_mismatch", message: "Grade is Superfino but rows per inch is 18." },
});

const sample = (): Card[] => [createQuestion, advance, blocked, flag].map(fromRow);

describe("cardView", () => {
  it("question card: amber, chips from the payload, no Approve", () => {
    const v = cardView(fromRow(createQuestion));
    expect(v.tone).toBe("question");
    expect(v.canApprove).toBe(false);
    expect(v.question?.choices.map((c) => c.label)).toEqual(["Rosa Pillco (Sígsig)", "Rosa Guamán (Cuenca)"]);
    expect(v.summary).toBe("Create 3 hats · Fino · 18 rows/inch · Weaver: 2 matches for “Rosa”");
  });

  it("pending advance: proposed tone, stepper and summary", () => {
    const v = cardView(fromRow(advance));
    expect(v.tone).toBe("proposed");
    expect(v.canApprove).toBe(true);
    expect(v.summary).toBe("Advance TQ-7F3K2 to Bleaching");
    expect(v.stepper).toEqual({ from: "Washing", to: "Bleaching", blocked: false });
  });

  it("blocked advance: red, rule message, fix button, no Approve", () => {
    const v = cardView(fromRow(blocked));
    expect(v.tone).toBe("blocked");
    expect(v.statusLabel).toBe("Blocked by rules");
    expect(v.canApprove).toBe(false);
    expect(v.summary).toBe("Move TQ-2C5P0 to Finished");
    expect(v.message).toBe("Can't move TQ-2C5P0 from Weaving to Finished. Next allowed stage: Washing.");
    expect(v.fix).toEqual({ label: "Change to Washing", edits: { to_stage: 1 } });
    expect(v.stepper?.blocked).toBe(true);
  });

  it("flag card summary", () => {
    expect(cardView(fromRow(flag)).summary).toBe("Flag TQ-4K9D1 · Grade is Superfino but rows per inch is 18.");
  });

  it("failed card uses the conflict copy", () => {
    const c = applyResult(fromRow(advance), { proposal_id: "p2", status: "failed", error: { code: "version_conflict", message: "x" } }, "req_1");
    const v = cardView(c);
    expect(v.tone).toBe("failed");
    expect(v.message).toBe("Couldn't save this change. Someone may have updated this hat.");
    expect(c.requestId).toBe("req_1");
  });

  it("dismissed shows as a rejected line labelled Dismissed", () => {
    const v = cardView({ ...fromRow(blocked), status: "dismissed" });
    expect(v.tone).toBe("rejected");
    expect(v.statusLabel).toBe("Dismissed");
  });

  it("a pending card's status tag says Pending, not a second 'Proposed by AI' (E2E-2)", () => {
    const v = cardView(fromRow(advance));
    expect(v.tone).toBe("proposed");
    expect(v.statusLabel).toBe("Pending");
  });

  it("open statuses: the database list plus editing and approving", () => {
    expect(OPEN_DB_STATUSES).toEqual(["pending", "question", "blocked", "failed"]);
    expect(OPEN_STATUSES).toEqual([...OPEN_DB_STATUSES, "editing", "approving"]);
    expect(isOpen("approving")).toBe(true);
    expect(isOpen("approved")).toBe(false);
    expect(isOpen("dismissed")).toBe(false);
  });

  it("covers all 8 visual states with an icon and a label", () => {
    const statuses = ["pending", "editing", "approving", "approved", "rejected", "blocked", "question", "failed"] as const;
    for (const status of statuses) {
      const v = cardView({ ...fromRow(advance), status });
      expect(v.statusLabel.length).toBeGreaterThan(0);
      expect(v.statusIcon.length).toBeGreaterThan(0);
    }
  });

  it("weaver_candidates (spec 04 shape) also become choices", () => {
    const r = row({
      id: "x",
      type: "create_hat",
      status: "question",
      payload: { quantity: 1, grade: "Fino", rows_per_inch: 18, weaver_candidates: [{ id: "w1", name: "Rosa Pillco", village: "Sígsig" }, { id: "w2", name: "Rosa Guamán", village: "Cuenca" }] },
    });
    const v = cardView(fromRow(r));
    expect(v.question?.text).toBe("I found 2 weavers named Rosa. Which one?");
    expect(v.question?.choices[0]).toEqual({ label: "Rosa Pillco (Sígsig)", weaver_id: "w1", hat_code: null });
  });

  it("ruleOf accepts both result shapes", () => {
    expect(ruleOf({ ok: false, message: "m", next_stage: 2 })).toEqual({ allowed: false, message: "m", fix: { to_stage: 2 } });
    expect(ruleOf({ allowed: false, message: "g", fix: { grade: "Fino" } })).toEqual({ allowed: false, message: "g", fix: { grade: "Fino" } });
    expect(ruleOf(null).allowed).toBe(true);
  });
});

describe("card actions", () => {
  it("answering a weaver chip makes the card pending with high confidence", () => {
    const c = answerChoice(fromRow(createQuestion), { label: "Rosa Pillco (Sígsig)", weaver_id: "w1", hat_code: null });
    expect(c.status).toBe("pending");
    expect(c.confidence).toBe("high");
    expect(c.draft.weaver_id).toBe("w1");
    expect(cardView(c).summary).toContain("Weaver: Rosa Pillco (Sígsig)");
    expect(editsForSubmit(c)).toEqual({ weaver_id: "w1" });
  });

  it("the blocked fix turns the card pending with Fixed by you", () => {
    const c = applyFix(fromRow(blocked), { to_stage: 1 });
    const v = cardView(c);
    expect(c.status).toBe("pending");
    expect(v.tag).toBe("Fixed by you");
    expect(v.summary).toBe("Advance TQ-2C5P0 to Washing");
    expect(editsForSubmit(c)).toEqual({ to_stage: 1 });
  });

  it("only whitelisted keys are sent as edits", () => {
    const c = { ...fromRow(advance), draft: { to_stage: 2, stage: 4, workshop_id: "x" } };
    expect(editsForSubmit(c)).toEqual({ to_stage: 2 });
    expect(editsForSubmit(fromRow(advance))).toBeUndefined();
  });

  it("a blocked result after approval shows the server message", () => {
    const c = applyResult(fromRow(advance), { proposal_id: "p2", status: "blocked", error: { code: "stage_skip", message: "Nope." } }, "r");
    expect(cardView(c).message).toBe("Nope.");
    expect(cardView(c).canApprove).toBe(false);
  });
});

describe("panel selection and completion", () => {
  it("approve all valid selects only pending cards", () => {
    expect(approveAllSelection(sample())).toEqual(["p2", "p4"]);
  });

  it("reject all covers pending, question and blocked", () => {
    expect(rejectAllSelection(sample())).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("completion text counts dismissed as rejected", () => {
    const cards = sample().map((c, i) => ({ ...c, status: i === 2 ? ("dismissed" as const) : ("approved" as const) }));
    expect(completionText(cards)).toBe("All done. 3 approved, 1 rejected.");
  });

  it("is not complete while a card is open, queued or in its undo window", () => {
    const now = 1000;
    const done = sample().map((c) => ({ ...c, status: "approved" as const }));
    expect(isComplete(done, now)).toBe(true);
    expect(isComplete([{ ...done[0], undoUntil: now + 5000 }, ...done.slice(1)], now)).toBe(false);
    expect(isComplete(done, now, new Set(["p1"]))).toBe(false);
    expect(isComplete([fromRow(advance)], now)).toBe(false);
    expect(isComplete([], now)).toBe(false);
  });

  it("new run cards go on top; open earlier cards stay, resolved ones drop", () => {
    const earlier = [{ ...fromRow(advance) }, { ...fromRow(flag), status: "approved" as const }];
    const { cards, earlierOpen } = mergeRun(earlier, [row({ id: "n1", type: "flag_issue" })], 0);
    expect(cards.map((c) => c.row.id)).toEqual(["n1", "p2"]);
    expect(earlierOpen).toBe(true);
  });

  it("toast copy", () => {
    expect(savedToastText(1)).toBe("1 change saved.");
    expect(savedToastText(3)).toBe("3 changes saved.");
    expect(approveToastText([fromRow(advance)])).toBe("Approved: TQ-7F3K2 → Bleaching");
    expect(approveToastText(sample().slice(1, 3))).toBe("Approved 2 proposals.");
  });
});

describe("checkDraft (edit form validation)", () => {
  it("create: grade mismatch offers the matching grade", () => {
    const r = checkDraft("create_hat", { quantity: 3, grade: "Fino", rows_per_inch: 30, weaver_id: "w1" });
    expect(r.ok).toBe(false);
    expect(r.mismatch).toEqual({ message: "30 rows/inch usually means Superfino.", grade: "Superfino" });
  });

  it("create: rows outside 6..40 and quantity outside 1..20 are errors", () => {
    const r = checkDraft("create_hat", { quantity: 21, grade: "Fino", rows_per_inch: 41, weaver_id: "w1" });
    expect(Object.keys(r.errors).sort()).toEqual(["quantity", "rows_per_inch"]);
  });

  it("create: a weaver is required", () => {
    expect(checkDraft("create_hat", { quantity: 3, grade: "Fino", rows_per_inch: 18, weaver_id: null }).errors.weaver_id).toBeTruthy();
    expect(checkDraft("create_hat", { quantity: 3, grade: "Fino", rows_per_inch: 18, weaver_id: "w1" }).ok).toBe(true);
  });

  it("advance: only the next stage", () => {
    expect(checkDraft("advance_stage", { from_stage: 1, to_stage: 2 }).ok).toBe(true);
    expect(checkDraft("advance_stage", { from_stage: 1, to_stage: 3 }).ok).toBe(false);
  });

  it("flag: message 1..200", () => {
    expect(checkDraft("flag_issue", { message: "" }).ok).toBe(false);
    expect(checkDraft("flag_issue", { message: "x".repeat(201) }).ok).toBe(false);
    expect(checkDraft("flag_issue", { message: "ok" }).ok).toBe(true);
  });
});

describe("undo queue (D14)", () => {
  it("undo before 10 s sends nothing", () => {
    let q = enqueue([], [{ proposal_id: "a" }], 0);
    q = cancel(q, ["a"]);
    expect(takeDue(q, UNDO_MS).due).toEqual([]);
  });

  it("after 10 s one decision is due", () => {
    const q = enqueue([], [{ proposal_id: "a", edits: { to_stage: 2 } }], 0);
    expect(takeDue(q, UNDO_MS - 1).due).toHaveLength(0);
    expect(takeDue(q, UNDO_MS).due).toEqual([{ proposal_id: "a", edits: { to_stage: 2 }, dueAt: UNDO_MS }]);
  });

  it("three approvals together are due together", () => {
    const q = enqueue([], [{ proposal_id: "a" }, { proposal_id: "b" }, { proposal_id: "c" }], 0);
    const { due, rest } = takeDue(q, UNDO_MS);
    expect(due.map((d) => d.proposal_id)).toEqual(["a", "b", "c"]);
    expect(rest).toEqual([]);
  });

  it("hiding the tab takes everything immediately", () => {
    const q = enqueue([], [{ proposal_id: "a" }], 0);
    expect(takeIds(q, "all").due).toHaveLength(1);
  });

  it("re-approving replaces the earlier entry", () => {
    const q = enqueue(enqueue([], [{ proposal_id: "a" }], 0), [{ proposal_id: "a" }], 5000);
    expect(q).toHaveLength(1);
    expect(q[0].dueAt).toBe(5000 + UNDO_MS);
  });
});

describe("format", () => {
  it("greets by time of day with the first name", () => {
    expect(greeting(9, "Xavier Pillco")).toBe("Good morning, Xavier");
    expect(greeting(14, "Xavier")).toBe("Good afternoon, Xavier");
    expect(greeting(20, "Xavier")).toBe("Good evening, Xavier");
  });

  it("member meta row has no costs; admin meta row has tool calls and cost", () => {
    expect(metaRowText({ role: "member", proposals: 4, meta: null, clientMs: 2100 })).toBe("4 actions prepared · 2.1 s");
    expect(
      metaRowText({ role: "admin", proposals: 4, meta: { tool_calls: 4, latency_ms: 2100, cost_usd: 0.004 }, clientMs: 0 }),
    ).toBe("4 tool calls · 2.1 s · $0.0040");
    expect(metaRowText({ role: "admin", proposals: 1, meta: null, clientMs: 3000 })).toBe("1 action prepared · 3.0 s");
  });

  it("relative times", () => {
    const now = Date.parse("2026-10-18T12:00:00Z");
    expect(relativeTime("2026-10-18T11:59:50Z", now)).toBe("just now");
    expect(relativeTime("2026-10-18T11:50:00Z", now)).toBe("10 min ago");
    expect(relativeTime("2026-10-18T09:00:00Z", now)).toBe("3 h ago");
    expect(relativeTime("2026-10-17T10:00:00Z", now)).toBe("yesterday");
  });

  it("activity text per event type", () => {
    const base = { id: "e", from_stage: 1, to_stage: 2, source: "manual", actor_id: null, created_at: "", hat_code: "TQ-7F3K2" };
    expect(activityText({ ...base, type: "stage_advanced" }).text).toBe("TQ-7F3K2 moved to Bleaching");
    expect(activityText({ ...base, type: "created" }).text).toBe("TQ-7F3K2 created");
    expect(activityText({ ...base, type: "flag_raised" }).text).toBe("Flag raised on TQ-7F3K2");
  });
});
