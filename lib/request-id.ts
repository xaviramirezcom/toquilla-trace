/** One id per user action: "req_" + 12 hex chars. Sent to Edge Functions as `x-request-id`. */
export function newRequestId(): string {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return "req_" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export const REQUEST_ID_RE = /^req_[0-9a-f]{12}$/;
