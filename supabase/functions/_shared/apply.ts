// Pure helpers for apply-proposals (spec 04 section 6): edit whitelist and the approval re-check.
// Only relative imports of domain.ts, so Vitest can test them.
import {
  type Actor,
  type Grade,
  GRADES,
  type HatLike,
  QUANTITY_MAX,
  QUANTITY_MIN,
  ROWS_MAX,
  ROWS_MIN,
  STAGES,
  canAdvance,
  gradeFor,
  gradeMismatch,
  normalizeCode,
  stageIndex,
} from "./domain.ts";

export type ProposalType = "create_hat" | "advance_stage" | "flag_issue";

export const EDITABLE: Record<ProposalType, readonly string[]> = {
  create_hat: ["quantity", "grade", "rows_per_inch", "weaver_id", "straw"],
  advance_stage: ["to_stage", "expected_version", "hat_code"],
  flag_issue: ["message", "hat_code"],
};

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
  // A changed stage or grade needs its display names refreshed.
  if (typeof merged.to_stage === "number") merged.to_stage_name = STAGES[merged.to_stage] ?? null;
  return merged;
}

export type ApprovalResult =
  | { ok: true }
  | { ok: false; kind: "rule" | "conflict"; code: string; message: string; next_stage?: number };

export interface ApprovalContext {
  hat: (Pick<HatLike, "code" | "stage" | "archived" | "workshop_id" | "owner_type" | "owner_user_id"> & {
    version: number;
  }) | null;
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
    const q = num(m.quantity);
    const rows = num(m.rows_per_inch);
    if (!(Number.isInteger(q) && q >= QUANTITY_MIN && q <= QUANTITY_MAX)) {
      return rule("quantity_range", "Quantity must be 1 to 20.");
    }
    if (!(Number.isInteger(rows) && rows >= ROWS_MIN && rows <= ROWS_MAX)) {
      return rule("rows_range", "Rows per inch must be 6 to 40.");
    }
    const grade = typeof m.grade === "string" ? m.grade : "";
    if (!(GRADES as readonly string[]).includes(grade)) return rule("grade_required", "Pick a grade.");
    if (gradeMismatch(grade as Grade, rows)) {
      const g = gradeFor(rows);
      return rule(
        "grade_mismatch",
        g ? `${rows} rows/inch usually means ${g}.` : `${rows} rows/inch is below the Standard range (8 to 14).`,
      );
    }
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
