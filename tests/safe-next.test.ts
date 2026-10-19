import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-next";
import { isProtectedPath } from "@/lib/routes";

describe("safeNext", () => {
  it.each([
    ["/hats/TQ-7F3K2", "/hats/TQ-7F3K2"],
    ["/logs?level=error", "/logs?level=error"],
    ["/workshop#proposals", "/workshop#proposals"],
  ])("keeps same-site path %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["https://evil.com"],
    ["//evil.com"],
    ["/\\evil.com"],
    ["javascript:alert(1)"],
    ["hats"],
    ["/login"],
    ["/login?next=/hats"],
    ["/signup"],
    ["/ok\nSet-Cookie: x"],
    ["/" + "a".repeat(600)],
  ])("falls back to /workshop for %j", (input) => {
    expect(safeNext(input)).toBe("/workshop");
  });

  it("uses a custom fallback", () => {
    expect(safeNext("https://evil.com", "/")).toBe("/");
  });
});

describe("isProtectedPath", () => {
  it("protects app routes and their children only", () => {
    expect(isProtectedPath("/workshop")).toBe(true);
    expect(isProtectedPath("/hats/TQ-7F3K2")).toBe(true);
    expect(isProtectedPath("/runs/abc")).toBe(true);
    expect(isProtectedPath("/settings")).toBe(true);
    expect(isProtectedPath("/hat/TQ-9A1M8")).toBe(false);
    expect(isProtectedPath("/hatsx")).toBe(false);
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
  });
});
