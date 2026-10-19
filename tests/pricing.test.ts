import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL, costUsd, formatUsd, usageFromGemini } from "@domain/pricing";

describe("costUsd (D26 Gemini Flash-Lite prices)", () => {
  it("prices input and output per million tokens", () => {
    expect(costUsd({ input_tokens: 1_000_000, output_tokens: 0 })).toBe(0.1);
    expect(costUsd({ input_tokens: 0, output_tokens: 1_000_000 })).toBe(0.4);
  });

  it("adds a realistic mixed run", () => {
    // 6000 * 0.10 + 1500 * 0.40 = 600 + 600 = 1200 micro-dollars
    expect(costUsd({ input_tokens: 6000, output_tokens: 1500 })).toBe(0.0012);
  });

  it("treats missing or null fields as 0", () => {
    expect(costUsd({})).toBe(0);
    expect(costUsd({ input_tokens: null, output_tokens: 10 })).toBe(0.000004);
  });
});

describe("usageFromGemini", () => {
  it("maps usageMetadata and bills thinking as output", () => {
    expect(
      usageFromGemini({
        promptTokenCount: 100,
        candidatesTokenCount: 20,
        thoughtsTokenCount: 5,
        cachedContentTokenCount: 40,
      }),
    ).toEqual({ input_tokens: 100, output_tokens: 25, cached_tokens: 40 });
    expect(usageFromGemini(undefined)).toEqual({ input_tokens: 0, output_tokens: 0, cached_tokens: 0 });
  });
});

describe("formatUsd", () => {
  it("shows 4 decimals, 6 for tiny costs, or n/a", () => {
    expect(formatUsd(0.0123)).toBe("$0.0123");
    expect(formatUsd(0.000004)).toBe("$0.000004");
    expect(formatUsd(0)).toBe("$0.0000");
    expect(formatUsd(null)).toBe("n/a");
  });

  it("default model is Flash-Lite", () => {
    expect(DEFAULT_MODEL).toBe("gemini-2.5-flash-lite");
  });
});
