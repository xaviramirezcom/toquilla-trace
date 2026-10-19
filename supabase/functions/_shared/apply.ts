// apply-proposals logic (spec 04 section 6): request parsing, edit whitelist, the approval re-check
// and the per-decision flow. The database is injected (ApplyData), so Vitest tests the whole flow;
// apply-proposals/index.ts only wires Supabase in. Only relative imports of domain.ts.
import {
  type Actor,
  type Grade,
  type HatLike,
  type ProposalType,
  QUANTITY_MAX,
  QUANTITY_MIN,
  STAGES,
  canAdvance,
  gradeMismatchMessage,
  normalizeCode,
  stageIndex,
  validateHatFields,
} from "./domain.ts";
import type { LogAction } from "./log-format.ts";

export type { ProposalType };

export const EDITABLE: Record<ProposalType, readonly string[]> = {
  create_hat: ["quantity", "grade", "rows_per_inch", "weaver_id", "straw"],
  advance_stage: ["to_stage", "expected_version", "hat_code"],
  flag_issue: ["message", "hat_code"],
};

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export interface Decision {
  proposal_id: string;
  action: "approve" | "reject";
  edits?: Record<string, unknown>;
}

export const MAX_DECISIONS = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 1 to 50 decisions with unique proposal ids; null when the body is not valid. */
export function parseDecisions(body: unknown): Decision[] | null {
  const list = (body as { decisions?: unknown } | null)?.decisions;
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_DECISIONS) return null;
  const seen = new Set<string>();
  const out: Decision[] = [];
  for (const d of list) {
    if (!d || typeof d !== "object") return null;
    const o = d as Record<string, unknown>;
    if (typeof o.proposal_id !== "string" || !UUID_RE.test(o.proposal_id)) return null;
    if (o.action !== "approve" && o.action !== "reject") return null;
    if (seen.has(o.proposal_id)) return null;
    if (o.edits !== undefined && o.edits !== null && (typeof o.edits !== "object" || Array.isArray(o.edits))) {
      return null;
    }
    seen.add(o.proposal_id);
    out.push({
      proposal_id: o.proposal_id,
      action: o.action,
      edits: (o.edits as Record<string, unknown> | undefined) ?? undefined,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

export class EditError extends Error {
  constructor(public readonly key: string) {
    super(`invalid_edits:${key}`);
  }
}

/** Whitelisted merge. to_stage may be sent as a name ("Washing") or an index. */
export function mergeEdits(
  type: ProposalType,
  payload: Record<string, unknown>,
  edits?: Record<string, unknown> | null,
): Record<string, unknown> {
  const allowed = EDITABLE[type];
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(edits ?? {})) {
    if (!allowed.includes(k)) throw new EditError(k);
    clean[k] = v;
  }
  // hat_code may only be filled in on a question card that had no hat yet.
  if ("hat_code" in clean && payload.hat_id) throw new EditError("hat_code");
  if (typeof clean.to_stage === "string") {
    const i = stageIndex(clean.to_stage);
    if (i === null) throw new EditError("to_stage");
    clean.to_stage = i;
  }
  if (typeof clean.hat_code === "string") {
    const c = normalizeCode(clean.hat_code);
    if (!c) throw new EditError("hat_code");
    clean.hat_code = c;
  }
  const merged: Record<string, unknown> = { ...payload, ...clean };
  delete merged.question;
  // A changed stage needs its display name refreshed.
  if (typeof merged.to_stage === "number") merged.to_stage_name = STAGES[merged.to_stage] ?? null;
  return merged;
}

// ---------------------------------------------------------------------------
// Approval re-check (pure)
// ---------------------------------------------------------------------------

export type ApprovalResult =
  | { ok: true }
  | { ok: false; kind: "rule" | "conflict"; code: string; message: string; next_stage?: number };

export type ApprovalHat = Pick<
  HatLike,
  "code" | "stage" | "archived" | "workshop_id" | "owner_type" | "owner_user_id" | "transfer_email"
> & { version: number };

export interface ApprovalContext {
  hat: ApprovalHat | null;
  weaver: { id: string } | null;
}

function rule(code: string, message: string, extra: { next_stage?: number } = {}): ApprovalResult {
  return { ok: false, kind: "rule", code, message, ...extra };
}

function num(v: unknown): number {
  return typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
}

/** Re-checks a merged proposal against fresh rows. The hat row is the truth, never the AI payload. */
export function validateApproval(
  type: ProposalType,
  m: Record<string, unknown>,
  ctx: ApprovalContext,
  actor: Actor,
): ApprovalResult {
  if (type === "create_hat") {
    const rows = num(m.rows_per_inch);
    const grade = typeof m.grade === "string" ? m.grade : "";
    // Same field rules as the forms and the agent tools (domain.validateHatFields).
    const errors = validateHatFields({ quantity: num(m.quantity), rows_per_inch: rows, grade });
    if (errors.quantity) return rule("quantity_range", errors.quantity);
    if (errors.rows_per_inch) return rule("rows_range", errors.rows_per_inch);
    if (errors.grade) return rule("grade_required", errors.grade);
    const mismatch = gradeMismatchMessage(grade as Grade, rows);
    if (mismatch) return rule("grade_mismatch", mismatch);
    if (!m.weaver_id || !ctx.weaver) return rule("weaver_required", "Pick a weaver for these hats.");
    return { ok: true };
  }

  const hat = ctx.hat;
  const code = typeof m.hat_code === "string" ? m.hat_code : "This hat";
  if (!hat || hat.archived || hat.workshop_id !== actor.workshopId) {
    return rule("hat_unavailable", `${code} isn't an open hat in your workshop.`);
  }
  if (type === "flag_issue") {
    const msg = typeof m.message === "string" ? m.message.trim() : "";
    const kinds = ["grade_mismatch", "too_fast", "weaver_not_found", "other"];
    if (!kinds.includes(String(m.kind))) return rule("kind_required", "Pick what kind of issue this is.");
    return msg && msg.length <= 200 ? { ok: true } : rule("message_required", "Add a short message.");
  }

  // advance_stage
  const to = num(m.to_stage);
  const expected = num(m.expected_version ?? m.hat_version);
  if (!Number.isInteger(expected) || hat.version !== expected) {
    return {
      ok: false,
      kind: "conflict",
      code: "version_conflict",
      message: "Couldn't save this change. Someone may have updated this hat.",
    };
  }
  const r = canAdvance(hat, to, actor);
  if (!r.allowed) {
    if (r.code === "stage_skip") {
      return rule("stage_skip", r.message, { next_stage: r.fix?.to_stage });
    }
    if (r.code === "already_finished") return rule("finished", "This hat is finished.");
    return rule(r.code, r.message);
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// SQL errors from apply_proposal()
// ---------------------------------------------------------------------------

export type ResultStatus = "approved" | "rejected" | "dismissed" | "blocked" | "failed";

/** apply_proposal() raises one of these words as the whole message (migration 5). */
export const SQL_ERRORS: Record<string, { status: ResultStatus; message: string }> = {
  version_conflict: { status: "failed", message: "Couldn't save this change. Someone may have updated this hat." },
  not_open: { status: "failed", message: "This proposal was already rejected." },
  not_found: { status: "failed", message: "Proposal not found." },
  weaver_not_found: { status: "blocked", message: "Pick a weaver for these hats." },
  quantity_range: { status: "blocked", message: `Quantity must be between ${QUANTITY_MIN} and ${QUANTITY_MAX}.` },
  hat_unavailable: { status: "blocked", message: "This hat isn't an open hat in your workshop." },
};

/**
 * The error word at the start of a SQL message ("weaver_not_found", "stage_skip: 0 to 4"), or
 * "internal". Exact word match, so "weaver_not_found" can never be read as "not_found".
 */
export function sqlErrorCode(message: string): string {
  const head = message.trim().split(/[\s:]/)[0];
  return Object.prototype.hasOwnProperty.call(SQL_ERRORS, head) ? head : "internal";
}

// ---------------------------------------------------------------------------
// One decision
// ---------------------------------------------------------------------------

export interface ProposalRow {
  id: string;
  run_id: string | null;
  workshop_id: string;
  type: string;
  payload: Record<string, unknown> | null;
  status: string;
}

export interface Result {
  proposal_id: string;
  status: ResultStatus;
  error?: { code: string; message: string };
  hat_codes?: string[];
}

/** Database access used by decideOne. The real one is the service role client (index.ts). */
export interface ApplyData {
  /** Updates a proposal that is still open. Returns an error message or null. */
  updateOpenProposal(id: string, patch: Record<string, unknown>): Promise<string | null>;
  findWeaver(id: string, workshopId: string): Promise<{ id: string; name: string } | null>;
  findHat(workshopId: string, by: { id: string } | { code: string }): Promise<(ApprovalHat & { id: string }) | null>;
  applyProposal(args: {
    p_proposal_id: string;
    p_actor: string;
    p_payload: Record<string, unknown>;
    p_edits: Record<string, unknown> | null;
    p_codes: null;
  }): Promise<{ data: unknown; error: { message: string } | null }>;
}

interface ApplyLogCtx {
  message?: string;
  payload?: Record<string, unknown>;
  hat_code?: string | null;
  run_id?: string | null;
  duration_ms?: number;
}

/** Subset of the server logger (log.ts Logger fits it). */
export interface ApplyLogger {
  info(action: LogAction, c?: ApplyLogCtx): void;
  warn(action: LogAction, c?: ApplyLogCtx): void;
  error(action: LogAction, err: unknown, c?: ApplyLogCtx): void;
}

export interface DecideDeps {
  data: ApplyData;
  log: ApplyLogger;
  actor: Actor;
  now?: () => number;
}

/**
 * Applies one human decision. Order: ownership, reject (idempotent), approve of an approved row
 * (idempotent), edit whitelist, fresh rows, domain re-check, then the SQL write. Never throws.
 */
export async function decideOne(deps: DecideDeps, d: Decision, p: ProposalRow | undefined): Promise<Result> {
  const { data, log, actor } = deps;
  const clock = deps.now ?? Date.now;
  const t0 = clock();
  const workshopId = actor.workshopId;
  // Another workshop's proposal looks exactly like a missing one (also for admins).
  if (!p || !workshopId || p.workshop_id !== workshopId) {
    log.warn("proposal.apply_failed", { payload: { proposal_id: d.proposal_id, code: "not_found" } });
    return { proposal_id: d.proposal_id, status: "failed", error: { code: "not_found", message: "Proposal not found." } };
  }
  const type = p.type as ProposalType;
  const payload = p.payload ?? {};
  const runCtx = { run_id: p.run_id, hat_code: (payload.hat_code as string | undefined) ?? null };
  try {
    if (d.action === "reject") {
      if (p.status === "approved") {
        return { proposal_id: p.id, status: "failed", error: { code: "already_approved", message: "This change was already approved." } };
      }
      if (p.status === "rejected" || p.status === "dismissed") return { proposal_id: p.id, status: p.status };
      const newStatus = p.status === "blocked" ? "dismissed" : "rejected";
      const err = await data.updateOpenProposal(p.id, {
        status: newStatus,
        decided_by: actor.userId,
        decided_at: new Date(clock()).toISOString(),
      });
      if (err) throw new Error(err);
      log.info("proposal.reject", { ...runCtx, payload: { proposal_id: p.id, type, status: newStatus } });
      return { proposal_id: p.id, status: newStatus };
    }

    // approve
    if (p.status === "approved") {
      log.info("proposal.approve", { ...runCtx, duration_ms: clock() - t0, payload: { proposal_id: p.id, type, idempotent: true } });
      return { proposal_id: p.id, status: "approved" };
    }
    if (p.status === "rejected" || p.status === "dismissed") {
      return { proposal_id: p.id, status: "failed", error: { code: "not_open", message: "This proposal was already rejected." } };
    }

    let merged: Record<string, unknown>;
    try {
      merged = mergeEdits(type, payload, d.edits);
    } catch (e) {
      const key = e instanceof EditError ? e.key : "edits";
      log.warn("proposal.apply_failed", { ...runCtx, payload: { proposal_id: p.id, type, code: "invalid_edits", key } });
      return {
        proposal_id: p.id,
        status: "failed",
        error: { code: "invalid_edits", message: `This field can't be changed here: ${key}.` },
      };
    }

    // Fresh rows: the database is the truth, not the AI payload.
    let hat: (ApprovalHat & { id: string }) | null = null;
    let weaver: { id: string; name: string } | null = null;
    if (type === "create_hat") {
      if (typeof merged.weaver_id === "string") {
        weaver = await data.findWeaver(merged.weaver_id, workshopId);
        if (weaver) merged.weaver_name = weaver.name;
      }
    } else {
      hat = await data.findHat(workshopId, merged.hat_id ? { id: String(merged.hat_id) } : { code: String(merged.hat_code ?? "") });
      if (hat && !merged.hat_id) {
        // A question card answered with a hat: the person picked it now, so use its current row.
        merged.hat_id = hat.id;
        merged.hat_code = hat.code;
        merged.from_stage = hat.stage;
        if (type === "advance_stage") merged.expected_version = hat.version;
      }
    }

    const r = validateApproval(type, merged, { hat, weaver }, actor);
    log[r.ok ? "info" : "warn"]("agent.rule.check", {
      ...runCtx,
      payload: { phase: "apply", proposal_id: p.id, type, ok: r.ok, ...(r.ok ? {} : { code: r.code, next_stage: r.next_stage }) },
    });
    if (!r.ok) {
      const status = r.kind === "conflict" ? "failed" : "blocked";
      const err = await data.updateOpenProposal(p.id, {
        status,
        rule_result: {
          allowed: false,
          code: r.code,
          message: r.message,
          fix: r.next_stage !== undefined ? { to_stage: r.next_stage } : null,
          warnings: [],
          phase: "apply",
          checked_at: new Date(clock()).toISOString(),
        },
      });
      if (err) log.warn("proposal.apply_failed", { ...runCtx, message: `status update failed: ${err}`, payload: { proposal_id: p.id } });
      log.warn("proposal.apply_failed", {
        ...runCtx,
        duration_ms: clock() - t0,
        payload: {
          proposal_id: p.id,
          type,
          code: r.code,
          expected_version: merged.expected_version ?? null,
          actual_version: hat?.version ?? null,
        },
      });
      return { proposal_id: p.id, status, error: { code: r.code, message: r.message } };
    }

    const edits = d.edits && Object.keys(d.edits).length > 0 ? d.edits : null;
    const { data: applied, error: rpcErr } = await data.applyProposal({
      p_proposal_id: p.id,
      p_actor: actor.userId,
      p_payload: merged,
      p_edits: edits,
      p_codes: null,
    });
    if (rpcErr) {
      const code = sqlErrorCode(rpcErr.message);
      const mapped = SQL_ERRORS[code] ?? { status: "failed" as const, message: "Couldn't save this change." };
      if (code !== "not_open" && code !== "not_found") {
        const err = await data.updateOpenProposal(p.id, { status: mapped.status });
        if (err) log.warn("proposal.apply_failed", { ...runCtx, message: `status update failed: ${err}`, payload: { proposal_id: p.id } });
      }
      if (code === "internal") {
        log.error("proposal.apply_failed", rpcErr, { ...runCtx, payload: { proposal_id: p.id, type, code } });
      } else {
        log.warn("proposal.apply_failed", { ...runCtx, payload: { proposal_id: p.id, type, code } });
      }
      return { proposal_id: p.id, status: mapped.status, error: { code, message: mapped.message } };
    }

    const out = (applied ?? {}) as { hat_codes?: string[]; flag_id?: string | null; idempotent?: boolean };
    const codes = Array.isArray(out.hat_codes) ? out.hat_codes : [];
    if (type === "create_hat" && !out.idempotent) {
      log.info("hat.create", {
        ...runCtx,
        hat_code: codes.length === 1 ? codes[0] : null,
        payload: { proposal_id: p.id, codes, grade: merged.grade, rows_per_inch: merged.rows_per_inch, weaver_id: merged.weaver_id },
      });
    } else if (type === "advance_stage" && !out.idempotent) {
      log.info("hat.stage.advance", {
        ...runCtx,
        hat_code: codes[0] ?? runCtx.hat_code,
        payload: {
          proposal_id: p.id,
          from: hat?.stage ?? null,
          to: merged.to_stage,
          version: typeof hat?.version === "number" ? hat.version + 1 : null,
        },
      });
    }
    log.info("proposal.approve", {
      ...runCtx,
      hat_code: codes.length === 1 ? codes[0] : runCtx.hat_code,
      duration_ms: clock() - t0,
      payload: {
        proposal_id: p.id,
        type,
        edited: edits !== null,
        edits,
        hat_codes: codes,
        flag_id: out.flag_id ?? null,
        idempotent: out.idempotent === true,
      },
    });
    return { proposal_id: p.id, status: "approved", hat_codes: codes };
  } catch (e) {
    log.error("proposal.apply_failed", e, { ...runCtx, duration_ms: clock() - t0, payload: { proposal_id: d.proposal_id, type, code: "internal" } });
    return { proposal_id: d.proposal_id, status: "failed", error: { code: "internal", message: "Couldn't save this change." } };
  }
}
