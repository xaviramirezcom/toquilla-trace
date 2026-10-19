// apply-proposals decision flow (supabase/functions/_shared/apply.ts) with an in-memory data layer.
import { describe, expect, it } from "vitest";
import {
  type ApplyData,
  type ApplyLogger,
  type ApprovalHat,
  type ProposalRow,
  decideOne,
  parseDecisions,
  sqlErrorCode,
} from "@domain/apply";
import { MEMBER, WS } from "./tools-fixtures";

const PID = "11111111-1111-4111-8111-111111111111";

function memoryLog() {
  const rows: { level: string; action: string; payload?: Record<string, unknown> }[] = [];
  const log: ApplyLogger = {
    info: (action, c) => rows.push({ level: "info", action, payload: c?.payload }),
    warn: (action, c) => rows.push({ level: "warn", action, payload: c?.payload }),
    error: (action, _e, c) => rows.push({ level: "error", action, payload: c?.payload }),
  };
  return { log, rows };
}

const HAT: ApprovalHat & { id: string } = {
  id: "h1",
  code: "TQ-7F3K2",
  stage: 1,
  archived: false,
  workshop_id: WS,
  owner_type: "workshop",
  owner_user_id: null,
  transfer_email: null,
  version: 2,
};

function fakeApply(opts: { hat?: (ApprovalHat & { id: string }) | null; rpcError?: string; rpcData?: unknown } = {}) {
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const rpcCalls: unknown[] = [];
  const data: ApplyData = {
    async updateOpenProposal(id, patch) {
      updates.push({ id, patch });
      return null;
    },
    async findWeaver(id) {
      return id === "w1" ? { id: "w1", name: "Rosa Pillco" } : null;
    },
    async findHat() {
      return opts.hat === undefined ? HAT : opts.hat;
    },
    async applyProposal(args) {
      rpcCalls.push(args);
      return opts.rpcError
        ? { data: null, error: { message: opts.rpcError } }
        : { data: opts.rpcData ?? { status: "approved", hat_codes: ["TQ-7F3K2"] }, error: null };
    },
  };
  return { data, updates, rpcCalls };
}

function proposal(p: Partial<ProposalRow> = {}): ProposalRow {
  return {
    id: PID,
    run_id: "r1",
    workshop_id: WS,
    type: "advance_stage",
    status: "pending",
    payload: { hat_id: "h1", hat_code: "TQ-7F3K2", to_stage: 2, expected_version: 2 },
    ...p,
  };
}

const approve = { proposal_id: PID, action: "approve" as const };

describe("parseDecisions", () => {
  it("accepts 1 to 50 unique decisions and rejects junk", () => {
    expect(parseDecisions({ decisions: [approve] })).toEqual([{ ...approve, edits: undefined }]);
    expect(parseDecisions({ decisions: [] })).toBeNull();
    expect(parseDecisions({ decisions: [approve, approve] })).toBeNull();
    expect(parseDecisions({ decisions: [{ proposal_id: "x", action: "approve" }] })).toBeNull();
    expect(parseDecisions({ decisions: [{ ...approve, edits: [1] }] })).toBeNull();
  });
});

describe("sqlErrorCode (C03)", () => {
  it("matches the exact error word, so weaver_not_found is never read as not_found", () => {
    expect(sqlErrorCode("weaver_not_found")).toBe("weaver_not_found");
    expect(sqlErrorCode("not_found")).toBe("not_found");
    expect(sqlErrorCode("version_conflict")).toBe("version_conflict");
    expect(sqlErrorCode("stage_skip: 0 to 4")).toBe("internal");
    expect(sqlErrorCode("duplicate key value violates unique constraint")).toBe("internal");
  });
});

describe("decideOne", () => {
  it("approves an open advance through apply_proposal with the fresh row", async () => {
    const f = fakeApply();
    const { log, rows } = memoryLog();
    const r = await decideOne({ data: f.data, log, actor: MEMBER }, approve, proposal());
    expect(r).toEqual({ proposal_id: PID, status: "approved", hat_codes: ["TQ-7F3K2"] });
    expect(f.rpcCalls).toHaveLength(1);
    expect(rows.map((x) => x.action)).toContain("hat.stage.advance");
  });

  it("approving an approved proposal is idempotent and writes nothing", async () => {
    const f = fakeApply();
    const r = await decideOne({ data: f.data, log: memoryLog().log, actor: MEMBER }, approve, proposal({ status: "approved" }));
    expect(r.status).toBe("approved");
    expect(f.rpcCalls).toHaveLength(0);
    expect(f.updates).toHaveLength(0);
  });

  it("another workshop's proposal looks missing", async () => {
    const f = fakeApply();
    const r = await decideOne({ data: f.data, log: memoryLog().log, actor: MEMBER }, approve, proposal({ workshop_id: "other" }));
    expect(r).toMatchObject({ status: "failed", error: { code: "not_found" } });
  });

  it("a stale version is a conflict: failed, nothing written", async () => {
    const f = fakeApply({ hat: { ...HAT, version: 3 } });
    const r = await decideOne({ data: f.data, log: memoryLog().log, actor: MEMBER }, approve, proposal());
    expect(r).toMatchObject({ status: "failed", error: { code: "version_conflict" } });
    expect(f.rpcCalls).toHaveLength(0);
    expect(f.updates[0].patch).toMatchObject({ status: "failed" });
  });

  it("a pending transfer blocks the approval (C02) without the old owner_type trick", async () => {
    const f = fakeApply({ hat: { ...HAT, transfer_email: "b@x.com" } });
    const r = await decideOne({ data: f.data, log: memoryLog().log, actor: MEMBER }, approve, proposal());
    expect(r).toMatchObject({ status: "blocked", error: { code: "transfer_pending" } });
    expect(f.rpcCalls).toHaveLength(0);
  });

  it("a SQL weaver_not_found (race after the check) maps to blocked 'Pick a weaver' (C03)", async () => {
    const f = fakeApply({ rpcError: "weaver_not_found" });
    const p = proposal({ type: "create_hat", payload: { weaver_id: "w1", quantity: 2, grade: "Fino", rows_per_inch: 18 } });
    const r = await decideOne({ data: f.data, log: memoryLog().log, actor: MEMBER }, approve, p);
    expect(r).toEqual({
      proposal_id: PID,
      status: "blocked",
      error: { code: "weaver_not_found", message: "Pick a weaver for these hats." },
    });
    expect(f.updates).toEqual([{ id: PID, patch: { status: "blocked" } }]);
  });

  it("an unknown SQL error is failed/internal and logged as an error", async () => {
    const f = fakeApply({ rpcError: "something broke" });
    const { log, rows } = memoryLog();
    const r = await decideOne({ data: f.data, log, actor: MEMBER }, approve, proposal());
    expect(r).toMatchObject({ status: "failed", error: { code: "internal" } });
    expect(rows.some((x) => x.level === "error")).toBe(true);
  });

  it("rejects: pending becomes rejected, blocked becomes dismissed, approved can't be rejected", async () => {
    const f = fakeApply();
    const deps = { data: f.data, log: memoryLog().log, actor: MEMBER };
    const reject = { proposal_id: PID, action: "reject" as const };
    expect((await decideOne(deps, reject, proposal())).status).toBe("rejected");
    expect((await decideOne(deps, reject, proposal({ status: "blocked" }))).status).toBe("dismissed");
    expect(await decideOne(deps, reject, proposal({ status: "approved" }))).toMatchObject({
      status: "failed",
      error: { code: "already_approved" },
    });
    expect((await decideOne(deps, reject, proposal({ status: "rejected" }))).status).toBe("rejected");
  });

  it("an edit outside the whitelist fails before any read or write", async () => {
    const f = fakeApply();
    const r = await decideOne(
      { data: f.data, log: memoryLog().log, actor: MEMBER },
      { ...approve, edits: { stage: 4 } },
      proposal(),
    );
    expect(r).toMatchObject({ status: "failed", error: { code: "invalid_edits" } });
    expect(f.rpcCalls).toHaveLength(0);
  });

  it("a question card answered with a hat uses that hat's current version", async () => {
    const f = fakeApply();
    const p = proposal({ status: "question", payload: { hat_id: null, hat_code: null, to_stage: 2 } });
    const r = await decideOne({ data: f.data, log: memoryLog().log, actor: MEMBER }, { ...approve, edits: { hat_code: "TQ-7F3K2" } }, p);
    expect(r.status).toBe("approved");
    expect(f.rpcCalls[0]).toMatchObject({ p_payload: { hat_id: "h1", expected_version: 2 } });
  });
});
