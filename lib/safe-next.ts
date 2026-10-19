// Only same-site relative paths are allowed as a post-login redirect (blocks open redirects).

export const DEFAULT_AFTER_LOGIN = "/workshop";

export function safeNext(next: string | null | undefined, fallback: string = DEFAULT_AFTER_LOGIN): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 512) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  if (/^\/(login|signup)(\/|\?|#|$)/.test(next)) return fallback;
  return next;
}
