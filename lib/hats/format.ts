// Pure helpers for the hats and weavers pages (no React, no Supabase). Tested in tests/hats.test.ts.
import { FINISHED_STAGE, GRADES, STAGES, canAdvance, foldText, stageName, type Actor } from "@domain/domain";
import type { HatDetail, HatEvent, HatFlag, HatListRow } from "./types";

/** The last stage (Finished), from the shared domain rules. */
export { FINISHED_STAGE };

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Oct 14" (UTC, so server and client render the same text). */
export function shortDate(iso: string | null | undefined): string {
  const d = iso ? toDate(iso) : null;
  return d ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` : "";
}

/** "Oct 14, 2026". */
export function longDate(iso: string | null | undefined): string {
  const d = iso ? toDate(iso) : null;
  return d ? `${shortDate(iso)}, ${d.getUTCFullYear()}` : "";
}

/** Whole days between two instants, never negative. */
export function daysBetween(fromIso: string, nowIso: string): number {
  const a = toDate(fromIso);
  const b = toDate(nowIso);
  if (!a || !b) return 0;
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86_400_000));
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then the short date. */
export function relativeTime(iso: string, nowIso: string): string {
  const a = toDate(iso);
  const b = toDate(nowIso);
  if (!a || !b) return "";
  const s = Math.max(0, Math.round((b.getTime() - a.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return shortDate(iso);
}

// ---------------------------------------------------------------------------
// Stage rules and copy (spec 08 section 6.2)
// ---------------------------------------------------------------------------

export const COPY: Record<string, string> = {
  finished: "This hat is finished.",
  not_owner: "Only the current owner can change the stage.",
  archived: "This hat is archived.",
  version_conflict: "Couldn't save this change. Someone may have updated this hat.",
  stage_rule: "Stages can't be skipped.",
  skip: "Stages can't be skipped.",
  backward: "Stages can't be skipped.",
  not_found: "Hat not found.",
  invalid_code: "Codes look like TQ-7F3K2.",
  already_reviewed: "This flag was already reviewed.",
  reason_required: "Add a reason (at least 3 characters).",
  invalid_email: "Enter a valid email.",
  weaver_not_found: "That weaver isn't in your workshop.",
  duplicate: "A weaver with this name and village already exists.",
  forbidden: "You can't change records in this workshop.",
  not_configured: "The app isn't connected to the database yet.",
  unknown: "Something went wrong. Try again.",
};

export function copyFor(code: string): string {
  return COPY[code] ?? COPY.unknown;
}

const KNOWN_DB_ERRORS = [
  "not_found",
  "archived",
  "not_owner",
  "finished",
  "version_conflict",
  "weaver_not_found",
  "stage_rule",
  "already_reviewed",
  "invalid_target",
  "invalid_email",
  "reason_required",
  "forbidden",
];

/** Maps a PostgREST / Postgres error to a short code (spec 08 section 6.2). */
export function mapDbError(error: { code?: string | null; message?: string | null } | null | undefined): string {
  if (!error) return "unknown";
  if (error.code === "23505") return "duplicate_code";
  if (error.code === "42501") return "forbidden";
  const msg = (error.message ?? "").trim();
  // mark_flag_reviewed raises this when the flag is gone or was reviewed first by someone else.
  if (msg.includes("not_found_or_reviewed")) return "already_reviewed";
  if (KNOWN_DB_ERRORS.includes(msg)) return msg;
  // Longest first, so "weaver_not_found" wins over "not_found".
  const byLength = [...KNOWN_DB_ERRORS].sort((a, b) => b.length - a.length);
  return byLength.find((known) => new RegExp(`\\b${known}\\b`).test(msg)) ?? "unknown";
}

export type AdvanceHatFields = Pick<
  HatDetail,
  "code" | "stage" | "archived" | "workshop_id" | "owner_type" | "owner_user_id" | "transfer_email"
>;

/**
 * Why the Advance button is disabled, or null when it can be pressed.
 * Uses the shared domain rule (canAdvance), which also blocks a hat with a pending transfer.
 */
export function advanceBlockReason(hat: AdvanceHatFields, actor: Actor): string | null {
  if (hat.archived) return COPY.archived;
  if (hat.stage >= FINISHED_STAGE) return COPY.finished;
  const rule = canAdvance(hat, hat.stage + 1, actor);
  if (rule.allowed) return null;
  if (rule.code === "archived") return COPY.archived;
  if (rule.code === "already_finished") return COPY.finished;
  if (rule.code === "not_owner") return COPY.not_owner;
  return rule.message;
}

export function nextStageName(stage: number): string | null {
  return stageName(stage) === null ? null : stageName(stage + 1);
}

// ---------------------------------------------------------------------------
// Activity, flags, owners
// ---------------------------------------------------------------------------

/** Activity text by event type (spec 08 section 6.6). */
export function activityText(e: Pick<HatEvent, "type" | "to_stage" | "note">, ownerType?: string): string {
  switch (e.type) {
    case "created":
      return "Created at Weaving";
    case "stage_advanced":
      return `Moved to ${stageName(e.to_stage ?? -1) ?? "the next stage"}`;
    case "transferred":
      return `Transferred to a ${ownerType && ownerType !== "workshop" ? ownerType : "new owner"}`;
    case "claimed":
      return "Claimed by the buyer";
    case "archived":
      return "Archived";
    case "flag_reviewed":
      return e.note ? `Flag reviewed: '${e.note}'` : "Flag reviewed";
    case "flag_raised":
      return e.note ? `Flag raised: ${e.note}` : "Flag raised";
    case "edited":
      return "Details edited";
    default:
      return e.type;
  }
}

export function activityIcon(type: string): string {
  switch (type) {
    case "created":
      return "add_circle";
    case "stage_advanced":
      return "arrow_forward";
    case "transferred":
      return "swap_horiz";
    case "claimed":
      return "how_to_reg";
    case "archived":
      return "inventory_2";
    case "flag_reviewed":
      return "task_alt";
    case "flag_raised":
      return "flag";
    default:
      return "edit";
  }
}

export function openFlags<F extends Pick<HatFlag, "reviewed_at">>(flags: readonly F[]): F[] {
  return flags.filter((f) => !f.reviewed_at);
}

export function ownerLabel(ownerType: string): string {
  if (ownerType === "seller") return "Seller";
  if (ownerType === "buyer") return "Buyer";
  return "Workshop";
}

/** Reason for "Mark as reviewed": trimmed, 3 to 300 characters (spec 08 section 6.4). */
export function validateReason(reason: string): string | null {
  const r = reason.trim();
  if (r.length < 3) return COPY.reason_required;
  if (r.length > 300) return "Keep the reason under 300 characters.";
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

// ---------------------------------------------------------------------------
// Production timeline
// ---------------------------------------------------------------------------

export interface TimelineStep {
  index: number;
  name: string;
  state: "done" | "current" | "upcoming";
  at: string | null;
  actor: string | null;
  source: string | null;
  note: string | null;
  runId: string | null;
}

/** Five steps. A done or current step takes its date from the event that reached it (Weaving uses weaving_started_at). */
export function timelineSteps(
  hat: Pick<HatDetail, "stage" | "weaving_started_at" | "created_at">,
  events: readonly HatEvent[],
): TimelineStep[] {
  return STAGES.map((name, index) => {
    const ev =
      index === 0
        ? events.find((e) => e.type === "created")
        : [...events].reverse().find((e) => e.type === "stage_advanced" && e.to_stage === index);
    const state: TimelineStep["state"] = index < hat.stage ? "done" : index === hat.stage ? "current" : "upcoming";
    const at = index === 0 ? (hat.weaving_started_at ?? ev?.created_at ?? hat.created_at) : (ev?.created_at ?? null);
    return {
      index,
      name,
      state,
      at: state === "upcoming" ? null : at,
      actor: ev?.actor_name ?? null,
      source: ev?.source ?? null,
      note: ev?.note ?? null,
      runId: ev?.run_id ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Hats list filtering
// ---------------------------------------------------------------------------

export interface HatFilters {
  q: string;
  flagged: boolean;
  stages: number[];
  grades: string[];
}

export const EMPTY_FILTERS: HatFilters = { q: "", flagged: false, stages: [], grades: [] };

export function hasActiveFilters(f: HatFilters): boolean {
  return f.q.trim() !== "" || f.flagged || f.stages.length > 0 || f.grades.length > 0;
}

/** Client-side filter: search matches code or weaver name (accent and case insensitive). */
export function filterHats<H extends Pick<HatListRow, "code" | "grade" | "stage" | "weaver" | "flags">>(
  rows: readonly H[],
  f: HatFilters,
): H[] {
  const q = foldText(f.q);
  const qCode = q.replace(/[^a-z0-9]/g, "");
  return rows.filter((h) => {
    if (q) {
      const code = h.code.toLowerCase().replace(/[^a-z0-9]/g, "");
      const weaver = foldText(h.weaver?.name ?? "");
      if (!(qCode && code.includes(qCode)) && !weaver.includes(q)) return false;
    }
    if (f.flagged && openFlags(h.flags).length === 0) return false;
    if (f.stages.length && !f.stages.includes(h.stage)) return false;
    if (f.grades.length && !f.grades.includes(h.grade)) return false;
    return true;
  });
}

/** "5 hats", "1 hat", or "2 of 5 hats" when filtered. */
export function hatCountLabel(shown: number, total: number, filtered: boolean): string {
  const noun = total === 1 ? "hat" : "hats";
  return filtered ? `${shown} of ${total} ${noun}` : `${total} ${noun}`;
}

// ---------------------------------------------------------------------------
// Weavers
// ---------------------------------------------------------------------------

export const PROVINCES = ["Azuay", "Cañar", "Manabí", "Other"] as const;

export interface WeaverInput {
  name: string;
  village: string;
  province: string;
  specialty: string[];
  weavingSince: number | null;
  bio: string;
  showName: boolean;
}

/** Field -> message (spec 08 section 6.5). */
export function validateWeaver(w: WeaverInput, currentYear: number): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = w.name.trim();
  const village = w.village.trim();
  if (!name) errors.name = "Enter the weaver's name.";
  else if (name.length > 80) errors.name = "Keep the name under 80 characters.";
  if (!village) errors.village = "Enter the village.";
  else if (village.length > 60) errors.village = "Keep the village under 60 characters.";
  if (!(PROVINCES as readonly string[]).includes(w.province)) errors.province = "Pick a province.";
  if (w.specialty.some((s) => !(GRADES as readonly string[]).includes(s))) errors.specialty = "Pick valid grades.";
  if (w.weavingSince !== null) {
    if (!Number.isInteger(w.weavingSince) || w.weavingSince < 1940 || w.weavingSince > currentYear) {
      errors.weavingSince = `Use a year between 1940 and ${currentYear}.`;
    }
  }
  if (w.bio.length > 200) errors.bio = "Keep the bio under 200 characters.";
  return errors;
}

/** Same name and village, case-insensitive (spec 08 rule 19). */
export function isDuplicateWeaver(
  w: Pick<WeaverInput, "name" | "village">,
  existing: readonly { id: string; name: string; village: string | null }[],
  ignoreId?: string,
): boolean {
  const n = w.name.trim().toLowerCase();
  const v = w.village.trim().toLowerCase();
  return existing.some((e) => e.id !== ignoreId && e.name.trim().toLowerCase() === n && (e.village ?? "").trim().toLowerCase() === v);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Passport preview line for the weaver dialog. */
export function passportLine(name: string, village: string, showName: boolean): string {
  const v = village.trim() || "their village";
  return showName && name.trim() ? `Hand-woven by ${name.trim()} in ${v}` : `A master weaver from ${v}`;
}
