// Hat code helpers for the public pages. Validation itself lives in domain.ts (isValidCode, normalizeCode).
import { isValidCode, normalizeCode } from "@domain/domain";

const UNICODE_DASHES = /[‐-―−_]/g;

/**
 * Formats what the user types in a code box: uppercase, letters and digits only,
 * hyphen inserted after "TQ" (the first 2 characters), max 8 characters ("TQ-XXXXX").
 */
export function formatCodeInput(raw: string): string {
  let v = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (v.length > 2) v = `${v.slice(0, 2)}-${v.slice(2, 7)}`;
  return v.slice(0, 8);
}

/** Canonical code ("TQ-9A1M8") or null. Accepts Unicode dashes and underscores as hyphens. */
export function canonicalHatCode(raw: string): string | null {
  const code = normalizeCode(raw.replace(UNICODE_DASHES, "-"));
  return code && isValidCode(code) ? code : null;
}

/** True when the input box value is a valid code (enables Verify). */
export function isVerifiable(value: string): boolean {
  return canonicalHatCode(value) !== null;
}

/** The text shown for a code we could not verify: trimmed, uppercased, whitespace removed, max 12 chars. */
export function displayCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "").slice(0, 12);
}

/** Safe-decodes a route param (a malformed % sequence must not crash the page). */
export function decodeParam(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export const VIA_VALUES = ["qr", "link", "verify_box", "retry"] as const;
export type Via = (typeof VIA_VALUES)[number];

export function parseVia(v: unknown): Via {
  return typeof v === "string" && (VIA_VALUES as readonly string[]).includes(v) ? (v as Via) : "link";
}

const BOT_RE = /bot|crawler|spider|facebookexternalhit|WhatsApp|Slackbot|TelegramBot|Twitterbot|Discordbot/i;

export function isBot(userAgent: string | null | undefined): boolean {
  return !!userAgent && BOT_RE.test(userAgent);
}
