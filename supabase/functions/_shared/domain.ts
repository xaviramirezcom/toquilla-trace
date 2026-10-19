// Toquilla Trace domain rules. PURE: zero imports, no I/O, no clock reads.
// Imported by Edge Functions (Deno, as "./domain.ts"), Next.js (as "@domain/domain")
// and Vitest. Spec: docs/specs/05-domain-rules.md (plus decisions D1, D10, D15).

// ---------------------------------------------------------------------------
// Constants and types
// ---------------------------------------------------------------------------

export const STAGES = ["Weaving", "Washing", "Bleaching", "Blocking", "Finished"] as const;
export type Stage = (typeof STAGES)[number];
export type StageIndex = 0 | 1 | 2 | 3 | 4;

/** The last stage. Finished hats can't change stage. */
export const FINISHED_STAGE: StageIndex = 4;

/** Longest workshop note (voice or typed) the agent accepts. */
export const NOTE_MAX = 1000;

/** D15: every new hat starts at Weaving, whatever the note says. */
export const NEW_HAT_STAGE: StageIndex = 0;

export type Grade = "Standard" | "Fino" | "Superfino";
export const GRADES: readonly Grade[] = ["Standard", "Fino", "Superfino"];
export const GRADE_RANGES: Record<Grade, [number, number]> = {
  Standard: [8, 14],
  Fino: [15, 24],
  Superfino: [25, 40],
};
export const ROWS_MIN = 6;
export const ROWS_MAX = 40;

export const STRAWS = ["Natural", "Bleached", "Dyed"] as const;
export type Straw = (typeof STRAWS)[number];
export const SIZE_MIN_CM = 52;
export const SIZE_MAX_CM = 64;
export const QUANTITY_MIN = 1;
export const QUANTITY_MAX = 20;

/** The three things the workshop agent can propose. One list for tools.ts, apply.ts and the UI. */
export const PROPOSAL_TYPES = ["create_hat", "advance_stage", "flag_issue"] as const;
export type ProposalType = (typeof PROPOSAL_TYPES)[number];

/** D1: the regex validates every code, including seed codes with 0 and 1. */
export const HAT_CODE_RE = /^TQ-[A-Z0-9]{5}$/;
/** D1: only newly generated codes use this alphabet (no I, O, 0, 1). */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type OwnerType = "workshop" | "seller" | "buyer";

/** Floors, not averages: a flag means "probably impossible". Tune with real data. */
export const MIN_WEAVING_DAYS: Record<Grade, number> = { Standard: 2, Fino: 14, Superfino: 60 };

export interface HatLike {
  code: string;
  workshop_id: string;
  weaver_id: string | null;
  grade: Grade;
  rows_per_inch: number;
  stage: number;
  owner_type: OwnerType;
  owner_user_id: string | null;
  transfer_email: string | null;
  archived: boolean;
  weaving_started_at: string | null;
  created_at: string;
}

export interface HatEventLike {
  type: string;
  from_stage: number | null;
  to_stage: number | null;
  created_at: string;
}

export interface Actor {
  userId: string;
  workshopId: string | null;
  role: "member" | "admin";
  email?: string;
}

export type RuleCode =
  | "invalid_stage"
  | "archived"
  | "not_owner"
  | "already_finished"
  | "same_stage"
  | "backward"
  | "stage_skip"
  | "transfer_pending"
  | "end_of_chain"
  | "invalid_email"
  | "no_transfer"
  | "not_recipient";

export type RuleResult =
  { allowed: true } | { allowed: false; code: RuleCode; message: string; fix?: { to_stage: StageIndex } };

export type AnomalyKind = "grade_mismatch" | "too_fast" | "weaver_not_found";
export interface Anomaly {
  kind: AnomalyKind;
  message: string;
}

export type CodeMatch =
  | { kind: "exact" | "confusable" | "fuzzy"; code: string }
  | { kind: "ambiguous"; candidates: string[] }
  | { kind: "none" };

type OwnerFields = Pick<HatLike, "workshop_id" | "owner_type" | "owner_user_id">;

const ALLOWED: RuleResult = { allowed: true };

function deny(code: RuleCode, message: string, fix?: { to_stage: StageIndex }): RuleResult {
  return fix ? { allowed: false, code, message, fix } : { allowed: false, code, message };
}

// ---------------------------------------------------------------------------
// Stage machine
// ---------------------------------------------------------------------------

function isStageIndex(i: number): i is StageIndex {
  return Number.isInteger(i) && i >= 0 && i <= FINISHED_STAGE;
}

export function stageName(i: number): Stage | null {
  return isStageIndex(i) ? STAGES[i] : null;
}

/** English names only, case-insensitive. Spanish is the model's job. */
export function stageIndex(name: string): StageIndex | null {
  const wanted = name.trim().toLowerCase();
  const i = STAGES.findIndex((s) => s.toLowerCase() === wanted);
  return i === -1 ? null : (i as StageIndex);
}

export function nextStage(i: StageIndex): StageIndex | null {
  return i >= FINISHED_STAGE ? null : ((i + 1) as StageIndex);
}

/** No admin bypass: admin is a read role, not a write role. */
export function isOwner(hat: OwnerFields, actor: Actor): boolean {
  if (hat.owner_type === "workshop") {
    return actor.workshopId !== null && actor.workshopId === hat.workshop_id;
  }
  return hat.owner_user_id !== null && actor.userId === hat.owner_user_id;
}

/**
 * Checks run in a fixed order and the first failure wins. Ownership comes before stage details.
 * A pending transfer locks the stage until the recipient claims the hat (same rule as advance_hat
 * and apply_proposal in SQL).
 */
export function canAdvance(
  hat: Pick<HatLike, "code" | "stage" | "archived" | "transfer_email"> & OwnerFields,
  to: number,
  actor: Actor,
): RuleResult {
  if (!isStageIndex(to)) return deny("invalid_stage", "That stage doesn't exist.");
  if (hat.archived) return deny("archived", "Archived hats can't change stage.");
  if (!isOwner(hat, actor)) return deny("not_owner", "Only the current owner can change the stage.");
  if (hat.transfer_email) {
    return deny("transfer_pending", `${hat.code} has a pending transfer. Stages are locked until it is claimed.`);
  }
  if (hat.stage === FINISHED_STAGE) return deny("already_finished", `${hat.code} is already Finished.`);
  const current = stageName(hat.stage) ?? `stage ${hat.stage}`;
  if (to === hat.stage) return deny("same_stage", `${hat.code} is already at ${current}.`);
  if (to < hat.stage) {
    return deny("backward", `Stages only move forward. ${hat.code} is at ${current}.`);
  }
  if (to > hat.stage + 1) {
    const next = (hat.stage + 1) as StageIndex;
    return deny(
      "stage_skip",
      `Can't move ${hat.code} from ${current} to ${STAGES[to]}. Next allowed stage: ${STAGES[next]}.`,
      { to_stage: next },
    );
  }
  return ALLOWED;
}

// ---------------------------------------------------------------------------
// Grades
// ---------------------------------------------------------------------------

export function gradeFor(rows: number): Grade | null {
  if (!Number.isInteger(rows)) return null;
  for (const g of GRADES) {
    const [min, max] = GRADE_RANGES[g];
    if (rows >= min && rows <= max) return g;
  }
  return null;
}

/** Rows 6 and 7 have no grade, so any grade mismatches them. */
export function gradeMismatch(grade: Grade, rows: number): boolean {
  return gradeFor(rows) !== grade;
}

export function gradeMismatchMessage(grade: Grade, rows: number): string | null {
  if (!gradeMismatch(grade, rows)) return null;
  const expected = gradeFor(rows);
  if (expected) return `${rows} rows/inch usually means ${expected}.`;
  const [min, max] = GRADE_RANGES.Standard;
  return `${rows} rows/inch is below the Standard range (${min} to ${max}).`;
}

export function validateRows(rows: number): string | null {
  return Number.isInteger(rows) && rows >= ROWS_MIN && rows <= ROWS_MAX
    ? null
    : `Rows per inch must be between ${ROWS_MIN} and ${ROWS_MAX}.`;
}

// ---------------------------------------------------------------------------
// Hat codes
// ---------------------------------------------------------------------------

/** Strict: validate after normalizing. */
export function isValidCode(s: string): boolean {
  return HAT_CODE_RE.test(s);
}

/** "tq 7f3k2" -> "TQ-7F3K2". Never swaps O and 0 (both are legal). */
export function normalizeCode(input: string): string | null {
  const s = input
    .trim()
    .toUpperCase()
    // Unicode dashes (hyphen, non-breaking hyphen, figure dash, en dash, em dash, minus) become "-"
    // first, so a code pasted from a document or typed on a phone keyboard still matches.
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .replace(/[\s\-._'"‘’“”]/g, "");
  let body: string | null = null;
  if (s.startsWith("TQ") && s.length === 7) body = s.slice(2);
  else if (s.length === 5) body = s;
  if (body === null || !/^[A-Z0-9]{5}$/.test(body)) return null;
  return `TQ-${body}`;
}

function canonicalBody(body: string): string {
  return body.toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1");
}

/** For comparison only: O -> 0, I and L -> 1 on the body. */
export function canonicalCode(code: string): string {
  return code.startsWith("TQ-") ? `TQ-${canonicalBody(code.slice(3))}` : canonicalBody(code);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

function tierResult(kind: "exact" | "confusable" | "fuzzy", hits: string[]): CodeMatch | null {
  if (hits.length === 0) return null;
  if (hits.length === 1) return { kind, code: hits[0] };
  return { kind: "ambiguous", candidates: hits };
}

/**
 * Tiers: exact, then confusable (O/0, I/L/1), then fuzzy (edit distance <= 1).
 * The first tier with any hit wins. A tie inside a tier is "ambiguous", never a guess.
 */
export function matchCode(input: string, candidates: readonly string[]): CodeMatch {
  const unique = Array.from(new Set(candidates));
  const normalized = normalizeCode(input);

  if (normalized) {
    const exact = tierResult(
      "exact",
      unique.filter((c) => c === normalized),
    );
    if (exact) return exact;
    const canon = canonicalCode(normalized);
    const confusable = tierResult(
      "confusable",
      unique.filter((c) => canonicalCode(c) === canon),
    );
    if (confusable) return confusable;
  }

  let raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.startsWith("TQ") && raw.length - 2 >= 4 && raw.length - 2 <= 6) raw = raw.slice(2);
  const rawCanon = canonicalBody(raw);
  if (rawCanon.length > 0) {
    const fuzzy = tierResult(
      "fuzzy",
      unique.filter((c) => {
        const body = canonicalBody(c.startsWith("TQ-") ? c.slice(3) : c);
        return Math.abs(body.length - rawCanon.length) <= 1 && levenshtein(rawCanon, body) <= 1;
      }),
    );
    if (fuzzy) return fuzzy;
  }
  return { kind: "none" };
}

/** New codes avoid I, O, 0 and 1. The caller retries up to 5 times on a unique violation. */
export function generateCode(rand: () => number): string {
  let body = "";
  for (let i = 0; i < 5; i++) {
    const idx = Math.min(CODE_ALPHABET.length - 1, Math.max(0, Math.floor(rand() * CODE_ALPHABET.length)));
    body += CODE_ALPHABET[idx];
  }
  return `TQ-${body}`;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** Lowercase, no accents, straight quotes, single spaces. */
export function foldText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the quote really appears in the note (ignoring case, accents, quotes and spacing). */
export function quoteInNote(quote: string, note: string): boolean {
  let q = foldText(quote);
  let prev = "";
  while (q !== prev) {
    prev = q;
    q = q
      .replace(/^["'«]+/, "")
      .replace(/["'»]+$/, "")
      .replace(/[.,;:!?]+$/, "")
      .trim();
  }
  if (q.length < 3 || q.length > 160) return false;
  return foldText(note).includes(q);
}

const HONORIFICS = new Set(["dona", "don", "senora", "sra", "sr", "la", "el"]);

/** Every query word must be a prefix of a word in the name. Never picks one of several matches. */
export function matchWeavers<W extends { name: string }>(query: string, weavers: readonly W[]): W[] {
  const words = foldText(query)
    .replace(/[.,;:!?]/g, " ")
    .split(" ")
    .filter((w) => w.length > 0 && !HONORIFICS.has(w));
  if (words.length === 0) return [];
  return weavers
    .filter((w) => {
      const nameWords = foldText(w.name).split(" ");
      return words.every((q) => nameWords.some((n) => n.startsWith(q)));
    })
    .sort((a, b) => foldText(a.name).localeCompare(foldText(b.name)))
    .slice(0, 5);
}

// ---------------------------------------------------------------------------
// Anomalies
// ---------------------------------------------------------------------------

export function minWeavingDays(grade: Grade): number {
  return MIN_WEAVING_DAYS[grade];
}

const DAY_MS = 86_400_000;

function firstLeftWeaving(events: readonly HatEventLike[]): HatEventLike | null {
  let first: HatEventLike | null = null;
  for (const e of events) {
    if (e.to_stage !== 1) continue;
    if (!first || Date.parse(e.created_at) < Date.parse(first.created_at)) first = e;
  }
  return first;
}

/** Whole days from weaving start to the move to Washing (or to `now` if still weaving). Null if unknown. */
export function weavingDays(
  hat: Pick<HatLike, "weaving_started_at">,
  events: readonly HatEventLike[],
  now?: string,
): number | null {
  if (!hat.weaving_started_at) return null;
  const start = Date.parse(hat.weaving_started_at);
  const left = firstLeftWeaving(events);
  const endIso = left ? left.created_at : now;
  if (!endIso) return null;
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.floor((end - start) / DAY_MS);
}

/**
 * Advisory flags, never blocks. `too_fast` needs an event to stage 1 (the caller can add a
 * simulated one at `now` to check a proposed advance).
 */
export function detectAnomalies<
  H extends Pick<HatLike, "grade" | "rows_per_inch" | "weaver_id" | "weaving_started_at">,
>(hat: H, events: readonly HatEventLike[], now?: string): Anomaly[] {
  const out: Anomaly[] = [];
  const gradeMsg = gradeMismatchMessage(hat.grade, hat.rows_per_inch);
  if (gradeMsg) out.push({ kind: "grade_mismatch", message: gradeMsg });

  if (firstLeftWeaving(events)) {
    const days = weavingDays(hat, events, now);
    const min = minWeavingDays(hat.grade);
    if (days !== null && days < min) {
      out.push({
        kind: "too_fast",
        message: `Woven in ${days} days. ${hat.grade} usually takes at least ${min}.`,
      });
    }
  }

  if (hat.weaver_id === null) {
    out.push({ kind: "weaver_not_found", message: "No weaver is linked to this hat." });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Transfer and claim
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function canTransfer(
  hat: Pick<HatLike, "archived"> & OwnerFields,
  actor: Actor,
  to: "seller" | "buyer",
  email: string,
): RuleResult {
  if (hat.archived) return deny("archived", "Archived hats can't be transferred.");
  if (!isOwner(hat, actor)) return deny("not_owner", "Only the current owner can transfer this hat.");
  if (hat.owner_type === "buyer") return deny("end_of_chain", "A buyer is the last owner.");
  if (hat.owner_type === "seller" && to === "seller") {
    return deny("end_of_chain", "A seller can only transfer to a buyer.");
  }
  if (!EMAIL_RE.test(email.trim())) return deny("invalid_email", "Enter a valid email.");
  return ALLOWED;
}

/** D11: the signed-in email must match the transfer email (case-insensitive). */
export function canClaim(hat: Pick<HatLike, "archived" | "transfer_email">, actor: Actor): RuleResult {
  if (hat.archived) return deny("archived", "Archived hats can't be claimed.");
  if (hat.transfer_email === null) return deny("no_transfer", "This hat has no pending transfer.");
  if (foldText(actor.email ?? "") !== foldText(hat.transfer_email)) {
    return deny("not_recipient", "This transfer was sent to a different email.");
  }
  return ALLOWED;
}

// ---------------------------------------------------------------------------
// Field validation
// ---------------------------------------------------------------------------

export interface HatFieldsInput {
  quantity?: number;
  rows_per_inch?: number;
  grade?: string;
  size_cm?: number | null;
  price_usd?: number | null;
  straw?: string | null;
}

/** Field -> message, empty when valid. Grade vs rows is not a field error (use gradeMismatchMessage). */
export function validateHatFields(f: HatFieldsInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (f.quantity !== undefined) {
    const q = f.quantity;
    if (!Number.isInteger(q) || q < QUANTITY_MIN || q > QUANTITY_MAX) {
      errors.quantity = `Quantity must be between ${QUANTITY_MIN} and ${QUANTITY_MAX}.`;
    }
  }
  if (f.rows_per_inch !== undefined) {
    const msg = validateRows(f.rows_per_inch);
    if (msg) errors.rows_per_inch = msg;
  }
  if (f.grade !== undefined && !(GRADES as readonly string[]).includes(f.grade)) {
    errors.grade = "Pick a grade.";
  }
  if (f.size_cm !== undefined && f.size_cm !== null) {
    const s = f.size_cm;
    if (!Number.isInteger(s) || s < SIZE_MIN_CM || s > SIZE_MAX_CM) {
      errors.size_cm = `Size must be between ${SIZE_MIN_CM} and ${SIZE_MAX_CM} cm.`;
    }
  }
  if (f.price_usd !== undefined && f.price_usd !== null) {
    if (!Number.isFinite(f.price_usd) || f.price_usd < 0) errors.price_usd = "Price can't be negative.";
  }
  if (f.straw !== undefined && f.straw !== null && !(STRAWS as readonly string[]).includes(f.straw)) {
    errors.straw = "Pick a straw color.";
  }
  return errors;
}
