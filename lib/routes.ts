/** Routes that need a signed-in user. The proxy redirects to /login?next=... for these. */
export const PROTECTED_PREFIXES = ["/workshop", "/hats", "/weavers", "/runs", "/logs", "/settings"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
