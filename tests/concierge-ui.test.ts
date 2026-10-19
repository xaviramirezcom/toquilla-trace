import { describe, expect, it } from "vitest";
import {
  answerKind,
  buildRequestMessages,
  classifyFailure,
  contactHref,
  counterText,
  nextSuggestions,
  parseAnswer,
  pillLabel,
  pillsFor,
  startSuggestions,
} from "@/lib/passport/concierge";

describe("suggestions", () => {
  it("uses the hat's own size", () => {
    expect(startSuggestions(58)).toEqual([
      "Is this hat real?",
      "Will it fit a 58 cm head?",
      "Is it good for golf?",
      "How do I care for it?",
      "Who made it?",
    ]);
  });

  it("returns 3 not yet asked", () => {
    expect(nextSuggestions(startSuggestions(58), ["Is this hat real?"])).toEqual([
      "Will it fit a 58 cm head?",
      "Is it good for golf?",
      "How do I care for it?",
    ]);
    expect(nextSuggestions(startSuggestions(58), startSuggestions(58))).toEqual([]);
  });
});

describe("source pills", () => {
  it("maps fields to labels", () => {
    expect(pillLabel({ kind: "record", field: "rows_per_inch" })).toBe("From this hat's passport · Grade");
    expect(pillLabel({ kind: "record", field: "size" })).toBe("From this hat's passport · Size");
    expect(pillLabel({ kind: "general" })).toBe("General care advice");
  });

  it("collapses duplicates and keeps tones", () => {
    const pills = pillsFor([
      { kind: "record", field: "grade" },
      { kind: "record", field: "rows_per_inch" },
      { kind: "general" },
      { kind: "general", field: "care_guide" },
    ]);
    expect(pills).toEqual([
      { label: "From this hat's passport · Grade", tone: "record", icon: "verified" },
      { label: "General care advice", tone: "general", icon: "lightbulb" },
    ]);
  });
});

describe("answers and failures", () => {
  it("classifies answer kinds", () => {
    expect(answerKind({ answer: "x", sources: [{ kind: "general" }] })).toBe("answer");
    expect(answerKind({ answer: "x", sources: [] })).toBe("unknown");
    expect(answerKind({ answer: "x", sources: [], refused: true })).toBe("refused");
  });

  it("parses and rejects malformed payloads", () => {
    expect(parseAnswer({ answer: "Hi", sources: [{ kind: "record", field: "size" }, { kind: "evil" }] })).toEqual({
      answer: "Hi",
      sources: [{ kind: "record", field: "size" }],
      refused: false,
    });
    expect(parseAnswer({ sources: [] })).toBeNull();
    expect(parseAnswer(null)).toBeNull();
  });

  it("maps rate limits", () => {
    expect(classifyFailure(429, null)).toBe("rate_limited");
    expect(classifyFailure(400, "rate_limited")).toBe("rate_limited");
    expect(classifyFailure(502, "model_error")).toBe("error");
    expect(classifyFailure(null, null)).toBe("error");
  });

  it("builds request messages and clips", () => {
    const msgs = buildRequestMessages([{ role: "assistant", content: "a".repeat(2000) }], "  Who made it?  ");
    expect(msgs[0].content).toHaveLength(1200);
    expect(msgs[1]).toEqual({ role: "user", content: "Who made it?" });
  });

  it("counter appears after 250 chars", () => {
    expect(counterText(250)).toBeNull();
    expect(counterText(251)).toBe("251 / 300");
  });

  it("builds the workshop mailto", () => {
    expect(contactHref("hola@tallerpillco.com", "TQ-9A1M8")).toBe(
      "mailto:hola@tallerpillco.com?subject=Question%20about%20TQ-9A1M8",
    );
    expect(contactHref(null, "TQ-9A1M8")).toBeNull();
  });
});
