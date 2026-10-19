// Pure helpers for the buyer concierge UI (spec 07 section 4).
import type { ChatTurn, ConciergeAnswer, ConciergeSource } from "./types";

export const MAX_QUESTION_CHARS = 300;
export const COUNTER_AFTER = 250;
export const MAX_USER_TURNS = 8;
export const MAX_ASSISTANT_CHARS = 1200;
export const CLIENT_TIMEOUT_MS = 25_000;

export function startSuggestions(sizeCm: number | null | undefined): string[] {
  return [
    "Is this hat real?",
    sizeCm ? `Will it fit a ${sizeCm} cm head?` : "How do I find my hat size?",
    "Is it good for golf?",
    "How do I care for it?",
    "Who made it?",
  ];
}

/** The first 3 suggestions not yet asked (exact text match). */
export function nextSuggestions(all: string[], asked: string[], count = 3): string[] {
  const done = new Set(asked);
  return all.filter((q) => !done.has(q)).slice(0, count);
}

export interface Pill {
  label: string;
  tone: "record" | "general";
  icon: string;
}

const FIELD_LABELS: Record<string, string> = {
  verification: "Verification",
  timeline: "Timeline",
  grade: "Grade",
  rows_per_inch: "Grade",
  straw: "Straw",
  size: "Size",
  price: "Price",
  weaver: "Weaver",
  workshop: "Workshop",
  ownership: "Ownership",
};

export function pillLabel(s: ConciergeSource): string | null {
  if (s.kind === "general") return "General care advice";
  if (s.kind !== "record") return null;
  const f = s.field ? FIELD_LABELS[s.field] : undefined;
  return f ? `From this hat's passport · ${f}` : "From this hat's passport";
}

/** Source pills for an answer, duplicates collapsed, unknown kinds dropped. */
export function pillsFor(sources: ConciergeSource[] | null | undefined): Pill[] {
  const seen = new Set<string>();
  const out: Pill[] = [];
  for (const s of sources ?? []) {
    const label = pillLabel(s);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(
      s.kind === "general"
        ? { label, tone: "general", icon: "lightbulb" }
        : { label, tone: "record", icon: "verified" },
    );
  }
  return out;
}

export type AnswerKind = "answer" | "unknown" | "refused";

/** Unknown is signalled as no sources and not refused (spec 07 open question 1). */
export function answerKind(a: ConciergeAnswer): AnswerKind {
  if (a.refused) return "refused";
  return (a.sources ?? []).length === 0 ? "unknown" : "answer";
}

/** Composer counter text, or null before 250 characters. */
export function counterText(length: number): string | null {
  return length > COUNTER_AFTER ? `${length} / ${MAX_QUESTION_CHARS}` : null;
}

/** Messages sent to the Edge Function: successful turns plus the new question, assistant text clipped. */
export function buildRequestMessages(history: ChatTurn[], question: string): ChatTurn[] {
  const turns = history.map((t) =>
    t.role === "assistant" ? { role: t.role, content: t.content.slice(0, MAX_ASSISTANT_CHARS) } : t,
  );
  return [...turns, { role: "user", content: question.trim().slice(0, MAX_QUESTION_CHARS) }];
}

export type ConciergeFailure = "rate_limited" | "error";

/** Maps an HTTP status and error body code to the UI state. 429 or rate_limited shows the banner. */
export function classifyFailure(status: number | null, code: string | null | undefined): ConciergeFailure {
  if (status === 429 || code === "rate_limited") return "rate_limited";
  return "error";
}

export const DEFAULT_RETRY_MS = 60_000;

/**
 * How long the server rate-limit banner stays: the Retry-After header (seconds) when the server sends
 * one, otherwise one minute (the server's per-minute window). Clamped to 1 s to 1 h.
 */
export function retryAfterMs(header: string | null | undefined): number {
  const secs = header ? Number(header) : NaN;
  if (!Number.isFinite(secs) || secs <= 0) return DEFAULT_RETRY_MS;
  return Math.min(Math.max(Math.round(secs * 1000), 1000), 3_600_000);
}

export type LimitKind = "chat" | "server";

/** Banner copy. "chat" = this conversation used its 8 questions; "server" = the server said 429. */
export function limitText(kind: LimitKind, waitMs: number): string {
  if (kind === "chat") return "You've reached the limit for this chat. Start a new chat to ask more.";
  const secs = Math.ceil(waitMs / 1000);
  const wait = secs <= 60 ? "a minute" : `${Math.ceil(secs / 60)} minutes`;
  return `You've asked a lot of questions. Try again in ${wait}.`;
}

/** Validates the success payload so a malformed response becomes an error bubble, not a crash. */
export function parseAnswer(data: unknown): ConciergeAnswer | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.answer !== "string" || !d.answer.trim()) return null;
  const sources = Array.isArray(d.sources)
    ? d.sources.filter(
        (s): s is ConciergeSource =>
          !!s &&
          typeof s === "object" &&
          ((s as ConciergeSource).kind === "record" || (s as ConciergeSource).kind === "general"),
      )
    : [];
  return { answer: d.answer, sources, refused: d.refused === true };
}

export function contactHref(email: string | null | undefined, code: string): string | null {
  if (!email) return null;
  return `mailto:${email}?subject=${encodeURIComponent(`Question about ${code}`)}`;
}
