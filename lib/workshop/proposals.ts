// Pure proposal-card logic for the review panel (spec 04). No React, no Supabase: tested in Node.
// Payload and rule_result shapes differ slightly between spec 03 (agent) and spec 04 (apply), so the
// readers below accept both (`hat_version` or `expected_version`, `allowed` or `ok`, `fix.to_stage`
// or `next_stage`, `question.choices` or `weaver_candidates`).
import {
  GRADES,
  QUANTITY_MAX,
  QUANTITY_MIN,
  STAGES,
  gradeFor,
  gradeMismatchMessage,
  stageName,
  validateHatFields,
  type Grade,
} from "@domain/domain";

export type ProposalType = "create_hat" | "advance_stage" | "flag_issue";
export type ServerStatus = "pending" | "question" | "blocked" | "approved" | "rejected" | "dismissed" | "failed";
export type CardStatus = ServerStatus | "editing" | "approving";
export type OpenStatus = "pending" | "question" | "blocked" | "failed";

/** A row of `proposals` as the client reads it (select-only, D4), or as `workshop-agent` returns it. */
export interface ProposalRow {
  id: string;
  run_id?: string | null;
  type: ProposalType;
  status: ServerStatus;
  payload: Record<string, unknown>;
  why: string | null;
  quote: string | null;
  confidence: "high" | "check" | null;
  rule_result: Record<string, unknown> | null;
  edited?: boolean | null;
  edits?: Record<string, unknown> | null;
  created_at?: string | null;
}

export type Edits = Record<string, unknown>;

export interface Card {
  row: ProposalRow;
  status: CardStatus;
  /** Status to go back to on Undo, Cancel edit or Restore. */
  prevStatus: OpenStatus;
  /** Human edits, sent as `edits` (whitelisted per type). */
  draft: Edits;
  edited: boolean;
  fixed: boolean;
  confidence: "high" | "check" | null;
  /** Server message for blocked or failed results that arrived after approval. */
  message?: string;
  /** Request id of the failing call, for "Reference: req_..." and View log. */
  requestId?: string;
  /** End of the 10 s undo window (ms since epoch). */
  undoUntil?: number;
  /** Rule result that came back from apply-proposals (blocked after approval). */
  liveRule?: Record<string, unknown> | null;
}

export const EDITABLE: Record<ProposalType, readonly string[]> = {
  create_hat: ["quantity", "grade", "rows_per_inch", "weaver_id"],
  advance_stage: ["to_stage", "expected_version"],
  flag_issue: ["message"],
};

export const TYPE_LABEL: Record<ProposalType, string> = {
  create_hat: "Create hat",
  advance_stage: "Advance stage",
  flag_issue: "Flag issue",
};

export const OPEN_STATUSES: readonly CardStatus[] = ["pending", "question", "blocked", "failed", "editing", "approving"];

export function isOpen(status: CardStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

function asOpen(s: ServerStatus): OpenStatus {
  return s === "question" || s === "blocked" || s === "failed" ? s : "pending";
}

export function fromRow(row: ProposalRow): Card {
  return {
    row,
    status: row.status,
    prevStatus: asOpen(row.status),
    draft: { ...(row.edits ?? {}) },
    edited: Boolean(row.edited),
    fixed: false,
    confidence: row.confidence,
  };
}

// ---------------------------------------------------------------------------
// Payload readers
// ---------------------------------------------------------------------------

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function effectivePayload(card: Card): Record<string, unknown> {
  return { ...card.row.payload, ...card.draft };
}

export interface Choice {
  label: string;
  weaver_id: string | null;
  hat_code: string | null;
}

export function questionOf(row: ProposalRow): { text: string; choices: Choice[] } | null {
  const q = row.payload.question as { text?: unknown; choices?: unknown } | undefined;
  if (q && typeof q === "object") {
    const choices = Array.isArray(q.choices)
      ? (q.choices as Record<string, unknown>[]).map((c) => ({
          label: str(c.label) ?? "",
          weaver_id: str(c.weaver_id),
          hat_code: str(c.hat_code),
        }))
      : [];
    return { text: str(q.text) ?? "Which one did you mean?", choices };
  }
  const cands = row.payload.weaver_candidates;
  if (Array.isArray(cands) && cands.length > 0) {
    const list = cands as { id?: unknown; name?: unknown; village?: unknown }[];
    const first = str(list[0]?.name)?.split(/\s+/)[0] ?? "that name";
    return {
      text: `I found ${list.length} weavers named ${first}. Which one?`,
      choices: list.map((c) => ({
        label: str(c.village) ? `${str(c.name)} (${str(c.village)})` : (str(c.name) ?? ""),
        weaver_id: str(c.id),
        hat_code: null,
      })),
    };
  }
  return row.status === "question" ? { text: "The assistant needs your answer.", choices: [] } : null;
}

export interface RuleView {
  allowed: boolean;
  message: string | null;
  fix: Edits | null;
}

export function ruleOf(rule: Record<string, unknown> | null | undefined): RuleView {
  if (!rule) return { allowed: true, message: null, fix: null };
  const allowed = rule.allowed === undefined ? rule.ok !== false : rule.allowed !== false;
  const message = str(rule.message);
  let fix: Edits | null = null;
  const f = rule.fix as Record<string, unknown> | null | undefined;
  if (f && typeof f === "object") {
    if (num(f.to_stage) !== null) fix = { to_stage: f.to_stage };
    else if (str(f.grade)) fix = { grade: f.grade };
  } else if (num(rule.next_stage) !== null) {
    fix = { to_stage: rule.next_stage };
  }
  return { allowed, message, fix };
}

function weaverLabel(p: Record<string, unknown>, row: ProposalRow, draft: Edits): string {
  if (draft.weaver_id) {
    const chosen = questionOf(row)?.choices.find((c) => c.weaver_id === draft.weaver_id);
    if (chosen) return chosen.label;
  }
  const name = str(p.weaver_name);
  if (name) return name;
  const q = questionOf(row);
  if (q && q.choices.length > 1) {
    const first = q.choices[0]?.label.split(/\s+/)[0] ?? "";
    return `${q.choices.length} matches for “${first}”`;
  }
  return "Not set";
}

// ---------------------------------------------------------------------------
// Card view
// ---------------------------------------------------------------------------

export type CardTone = "proposed" | "editing" | "approved" | "rejected" | "blocked" | "question" | "failed";

export interface CardView {
  typeLabel: string;
  summary: string;
  chips: { label: string; value: string }[];
  tone: CardTone;
  statusLabel: string;
  statusIcon: string;
  canApprove: boolean;
  canEdit: boolean;
  canReject: boolean;
  stepper: { from: string; to: string; blocked: boolean } | null;
  message: string | null;
  question: { text: string; choices: Choice[] } | null;
  fix: { label: string; edits: Edits } | null;
  hatCode: string | null;
  tag: "Edited by you" | "Fixed by you" | null;
}

export const FAILED_MESSAGE = "Couldn't save this change. Someone may have updated this hat.";

export function hatCodeOf(card: Card): string | null {
  return str(effectivePayload(card).hat_code);
}

export function summaryOf(card: Card, tone?: CardTone): string {
  const p = effectivePayload(card);
  const code = str(p.hat_code) ?? "this hat";
  switch (card.row.type) {
    case "create_hat": {
      const q = num(p.quantity);
      const parts = [
        `Create ${q ?? "?"} ${q === 1 ? "hat" : "hats"}`,
        str(p.grade) ?? "grade not set",
        `${num(p.rows_per_inch) ?? "?"} rows/inch`,
        `Weaver: ${weaverLabel(p, card.row, card.draft)}`,
      ];
      return parts.join(" · ");
    }
    case "advance_stage": {
      const to = stageName(num(p.to_stage) ?? -1) ?? "the next stage";
      return tone === "blocked" ? `Move ${code} to ${to}` : `Advance ${code} to ${to}`;
    }
    case "flag_issue":
      return `Flag ${code} · ${str(p.message) ?? "needs a check"}`;
  }
}

function chipsOf(card: Card): { label: string; value: string }[] {
  const p = effectivePayload(card);
  switch (card.row.type) {
    case "create_hat":
      return [
        { label: "Qty", value: String(num(p.quantity) ?? "?") },
        { label: "Grade", value: str(p.grade) ?? "?" },
        { label: "Rows/inch", value: String(num(p.rows_per_inch) ?? "?") },
        { label: "Weaver", value: weaverLabel(p, card.row, card.draft) },
      ];
    case "advance_stage":
      return [
        { label: "Hat", value: str(p.hat_code) ?? "?" },
        { label: "Owner", value: "Workshop" },
      ];
    case "flag_issue":
      return [
        { label: "Hat", value: str(p.hat_code) ?? "?" },
        { label: "Kind", value: (str(p.kind) ?? "other").replace(/_/g, " ") },
      ];
  }
}

const STATUS_META: Record<CardTone, { label: string; icon: string }> = {
  proposed: { label: "Proposed by AI", icon: "auto_awesome" },
  editing: { label: "Editing", icon: "edit" },
  approved: { label: "Approved", icon: "check_circle" },
  rejected: { label: "Rejected", icon: "close" },
  blocked: { label: "Blocked by rules", icon: "lock" },
  question: { label: "Needs your answer", icon: "help" },
  failed: { label: "Approval failed", icon: "error" },
};

export function toneOf(status: CardStatus): CardTone {
  switch (status) {
    case "pending":
    case "approving":
      return "proposed";
    case "editing":
      return "editing";
    case "approved":
      return "approved";
    case "rejected":
    case "dismissed":
      return "rejected";
    case "blocked":
      return "blocked";
    case "question":
      return "question";
    case "failed":
      return "failed";
  }
}

export function cardView(card: Card): CardView {
  const tone = toneOf(card.status);
  const p = effectivePayload(card);
  const rule = ruleOf(card.liveRule ?? card.row.rule_result);
  const meta = STATUS_META[tone];
  let statusLabel = meta.label;
  if (card.status === "dismissed") statusLabel = "Dismissed";

  let fix: CardView["fix"] = null;
  if (tone === "blocked" && rule.fix) {
    if (rule.fix.to_stage !== undefined) {
      fix = { label: `Change to ${stageName(Number(rule.fix.to_stage)) ?? "next stage"}`, edits: rule.fix };
    } else if (rule.fix.grade) {
      fix = { label: `Use ${String(rule.fix.grade)}`, edits: rule.fix };
    }
  }

  let stepper: CardView["stepper"] = null;
  if (card.row.type === "advance_stage") {
    const from = stageName(num(p.from_stage) ?? -1);
    const to = stageName(num(p.to_stage) ?? -1);
    if (from && to) stepper = { from, to, blocked: tone === "blocked" };
  }

  let message: string | null = null;
  if (tone === "blocked") message = card.message ?? rule.message ?? "The rules don't allow this change.";
  if (tone === "failed") message = card.message ?? FAILED_MESSAGE;

  const question = tone === "question" ? questionOf(card.row) : null;

  return {
    typeLabel: TYPE_LABEL[card.row.type],
    summary: summaryOf(card, tone),
    chips: chipsOf(card),
    tone,
    statusLabel,
    statusIcon: meta.icon,
    canApprove: card.status === "pending",
    canEdit: card.status === "pending" || card.status === "question" || card.status === "blocked",
    canReject: card.status === "pending" || card.status === "question" || card.status === "blocked",
    stepper,
    message,
    question,
    fix,
    hatCode: str(p.hat_code),
    tag: card.fixed ? "Fixed by you" : card.edited ? "Edited by you" : null,
  };
}

// ---------------------------------------------------------------------------
// Panel-level helpers
// ---------------------------------------------------------------------------

/** Approve all valid includes only `pending` cards (spec 04 rule 12). */
export function approveAllSelection(cards: readonly Card[]): string[] {
  return cards.filter((c) => c.status === "pending").map((c) => c.row.id);
}

/** Reject all covers every card that can still be rejected. */
export function rejectAllSelection(cards: readonly Card[]): string[] {
  return cards
    .filter((c) => c.status === "pending" || c.status === "question" || c.status === "blocked")
    .map((c) => c.row.id);
}

export function inUndoWindow(card: Card, now: number): boolean {
  return card.status === "approved" && card.undoUntil !== undefined && card.undoUntil > now;
}

/** Completion card shows only when nothing is open, in flight or in an undo window (rule 19). */
export function isComplete(cards: readonly Card[], now: number, queued: ReadonlySet<string> = new Set()): boolean {
  if (cards.length === 0) return false;
  return cards.every((c) => !isOpen(c.status) && !inUndoWindow(c, now) && !queued.has(c.row.id));
}

export function completionCounts(cards: readonly Card[]): { approved: number; rejected: number } {
  let approved = 0;
  let rejected = 0;
  for (const c of cards) {
    if (c.status === "approved") approved++;
    else if (c.status === "rejected" || c.status === "dismissed") rejected++;
  }
  return { approved, rejected };
}

export function completionText(cards: readonly Card[]): string {
  const { approved, rejected } = completionCounts(cards);
  return `All done. ${approved} approved, ${rejected} rejected.`;
}

export function savedToastText(n: number): string {
  return n === 1 ? "1 change saved." : `${n} changes saved.`;
}

export function approveToastText(cards: readonly Card[]): string {
  if (cards.length === 1) {
    const c = cards[0];
    const p = effectivePayload(c);
    if (c.row.type === "advance_stage") {
      return `Approved: ${str(p.hat_code) ?? "hat"} → ${stageName(num(p.to_stage) ?? -1) ?? "next stage"}`;
    }
    if (c.row.type === "create_hat") {
      const q = num(p.quantity) ?? 1;
      return `Approved: create ${q} ${q === 1 ? "hat" : "hats"}`;
    }
    return `Approved: flag ${str(p.hat_code) ?? "hat"}`;
  }
  return `Approved ${cards.length} proposals.`;
}

/**
 * A new run's cards go on top. Earlier cards that are open, in flight or in an undo window stay
 * below; resolved ones are dropped (spec 04 "Merging new proposals").
 */
export function mergeRun(
  existing: readonly Card[],
  incoming: readonly ProposalRow[],
  now: number,
  queued: ReadonlySet<string> = new Set(),
): { cards: Card[]; earlierOpen: boolean } {
  const ids = new Set(incoming.map((r) => r.id));
  const kept = existing.filter(
    (c) => !ids.has(c.row.id) && (isOpen(c.status) || inUndoWindow(c, now) || queued.has(c.row.id)),
  );
  return { cards: [...incoming.map(fromRow), ...kept], earlierOpen: kept.some((c) => isOpen(c.status)) };
}

/** Only whitelisted keys are sent; the server rejects anything else (spec 04 rule 8). */
export function editsForSubmit(card: Card): Edits | undefined {
  const allowed = EDITABLE[card.row.type];
  const out: Edits = {};
  for (const [k, v] of Object.entries(card.draft)) if (allowed.includes(k)) out[k] = v;
  return Object.keys(out).length ? out : undefined;
}

export interface ApplyResult {
  proposal_id: string;
  status: ServerStatus;
  error?: { code: string; message: string } | null;
}

/** Maps one apply-proposals result back onto its card. */
export function applyResult(card: Card, r: ApplyResult, requestId: string): Card {
  switch (r.status) {
    case "approved":
      return { ...card, status: "approved", message: undefined };
    case "rejected":
    case "dismissed":
      return { ...card, status: r.status };
    case "blocked":
      return {
        ...card,
        status: "blocked",
        prevStatus: "blocked",
        undoUntil: undefined,
        message: r.error?.message ?? undefined,
        liveRule: { allowed: false, message: r.error?.message ?? null, ...(r.error as Record<string, unknown> | undefined) },
      };
    default:
      return {
        ...card,
        status: "failed",
        undoUntil: undefined,
        requestId,
        message: r.error?.code === "version_conflict" || !r.error?.message ? FAILED_MESSAGE : r.error.message,
      };
  }
}

/** Answering a question chip: fill the chosen weaver and make the card pending with high confidence. */
export function answerChoice(card: Card, choice: Choice): Card {
  const draft = { ...card.draft };
  if (choice.weaver_id) draft.weaver_id = choice.weaver_id;
  return { ...card, draft, status: "pending", prevStatus: "pending", confidence: "high" };
}

/** "Change to Washing" / "Use Fino": apply the rule's fix and return to pending. */
export function applyFix(card: Card, edits: Edits): Card {
  return {
    ...card,
    draft: { ...card.draft, ...edits },
    status: "pending",
    prevStatus: "pending",
    fixed: true,
    message: undefined,
    liveRule: null,
  };
}

// ---------------------------------------------------------------------------
// Edit form validation (domain.ts rules)
// ---------------------------------------------------------------------------

export interface DraftCheck {
  errors: Record<string, string>;
  /** Grade vs rows mismatch with its fix, e.g. { message: "18 rows/inch usually means Fino.", grade: "Fino" }. */
  mismatch: { message: string; grade: Grade | null } | null;
  ok: boolean;
}

export function checkDraft(type: ProposalType, values: Record<string, unknown>): DraftCheck {
  const errors: Record<string, string> = {};
  let mismatch: DraftCheck["mismatch"] = null;
  if (type === "create_hat") {
    const quantity = Number(values.quantity);
    const rows = Number(values.rows_per_inch);
    const grade = String(values.grade ?? "");
    Object.assign(errors, validateHatFields({ quantity, rows_per_inch: rows, grade }));
    if (!errors.rows_per_inch && (GRADES as readonly string[]).includes(grade)) {
      const msg = gradeMismatchMessage(grade as Grade, rows);
      if (msg) mismatch = { message: msg, grade: gradeFor(rows) };
    }
    if (!values.weaver_id) errors.weaver_id = "Pick a weaver for these hats.";
  } else if (type === "advance_stage") {
    const from = Number(values.from_stage);
    const to = Number(values.to_stage);
    if (!(Number.isInteger(to) && to === from + 1 && to <= STAGES.length - 1)) {
      errors.to_stage = "Only the next stage is allowed.";
    }
  } else {
    const message = String(values.message ?? "").trim();
    if (message.length < 1 || message.length > 200) errors.message = "Add a short message (up to 200 characters).";
  }
  return { errors, mismatch, ok: Object.keys(errors).length === 0 && mismatch === null };
}

export const QUANTITY_RANGE = [QUANTITY_MIN, QUANTITY_MAX] as const;
