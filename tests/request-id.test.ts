import { describe, expect, it } from "vitest";
import { REQUEST_ID_RE, newRequestId } from "@/lib/request-id";

describe("newRequestId", () => {
  it("is req_ plus 12 hex chars and differs between calls", () => {
    const a = newRequestId();
    const b = newRequestId();
    expect(a).toMatch(/^req_[0-9a-f]{12}$/);
    expect(a).toMatch(REQUEST_ID_RE);
    expect(a).not.toBe(b);
  });
});
