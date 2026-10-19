import { describe, expect, it } from "vitest";
import { canonicalHatCode, displayCode, formatCodeInput, isBot, isVerifiable, parseVia } from "@/lib/passport/code";
import { daysBetween, formatDate, humanDuration } from "@/lib/passport/format";
import { gradeTip, passportMeta } from "@/lib/passport/meta";
import { ownershipChain, ownershipView, showsClaim } from "@/lib/passport/ownership";
import { reportHref } from "@/lib/passport/report";
import { buildStory, certificateStatus } from "@/lib/passport/story";
import type { Passport } from "@/lib/passport/types";

const seed: Passport = {
  code: "TQ-9A1M8",
  archived: false,
  grade: "Superfino",
  rows_per_inch: 32,
  straw: "Natural",
  size_cm: 58,
  price_usd: null,
  stage: 4,
  weaving_started_at: "2026-05-12",
  created_at: "2026-05-12T15:00:00Z",
  workshop: { name: "Taller Pillco", city: "Cuenca", contact_email: "hola@tallerpillco.com" },
  weaver: {
    name: "Manuel Delgado",
    village: "Pile",
    province: "Manabí",
    weaving_since: 1985,
    bio: "Learned from his father.",
    other_hats: 4,
  },
  events: [
    { type: "created", from_stage: null, to_stage: 0, at: "2026-05-12T15:00:00Z" },
    { type: "stage_advanced", from_stage: 0, to_stage: 1, at: "2026-09-12T15:00:00Z" },
    { type: "stage_advanced", from_stage: 1, to_stage: 2, at: "2026-09-15T15:00:00Z" },
    { type: "stage_advanced", from_stage: 2, to_stage: 3, at: "2026-09-24T15:00:00Z" },
    { type: "stage_advanced", from_stage: 3, to_stage: 4, at: "2026-10-02T15:00:00Z" },
    { type: "transferred", from_stage: null, to_stage: null, at: "2026-10-10T16:30:00Z" },
  ],
  open_flags: 0,
  ownership: { owner_type: "workshop", pending_transfer: true },
  viewer: "anonymous",
};

describe("code input", () => {
  it("formats as the user types", () => {
    expect(formatCodeInput("tq9a1m8")).toBe("TQ-9A1M8");
    expect(formatCodeInput("t")).toBe("T");
    expect(formatCodeInput("tq")).toBe("TQ");
    expect(formatCodeInput("tq9")).toBe("TQ-9");
    expect(formatCodeInput("TQ-9A1M8XYZ")).toBe("TQ-9A1M8");
    expect(formatCodeInput("tq 9a-1m8")).toBe("TQ-9A1M8");
  });

  it("canonicalizes codes like spec 06 normalizeCode", () => {
    expect(canonicalHatCode(" tq-9a1m8 ")).toBe("TQ-9A1M8");
    expect(canonicalHatCode("TQ9A1M8")).toBe("TQ-9A1M8");
    expect(canonicalHatCode("TQ–9A1M8")).toBe("TQ-9A1M8");
    expect(canonicalHatCode("TQ-2C5P0")).toBe("TQ-2C5P0");
    expect(canonicalHatCode("TQ-9A1M")).toBeNull();
    expect(isVerifiable("TQ-9A1M")).toBe(false);
    expect(isVerifiable("tq9a1m8")).toBe(true);
  });

  it("cuts the not-verified display to 12 characters", () => {
    expect(displayCode(" tq-zzzzz ")).toBe("TQ-ZZZZZ");
    expect(displayCode("abcdefghijklmnop")).toHaveLength(12);
  });

  it("parses via and bots", () => {
    expect(parseVia("verify_box")).toBe("verify_box");
    expect(parseVia("evil")).toBe("link");
    expect(parseVia(undefined)).toBe("link");
    expect(isBot("WhatsApp/2.23")).toBe(true);
    expect(isBot("Mozilla/5.0 (iPhone)")).toBe(false);
    expect(isBot(null)).toBe(false);
  });
});

describe("dates", () => {
  it("formats dates and durations", () => {
    expect(formatDate("2026-10-10T16:30:00Z")).toBe("Oct 10, 2026");
    expect(formatDate("2026-05-12")).toBe("May 12, 2026");
    expect(humanDuration(10)).toBe("10 days");
    expect(humanDuration(21)).toBe("3 weeks");
    expect(humanDuration(121)).toBe("4 months");
    expect(daysBetween("2026-05-12", "2026-09-12T15:00:00Z")).toBe(123);
  });
});

describe("buildStory", () => {
  it("builds the seed TQ-9A1M8 story", () => {
    const s = buildStory(seed);
    expect(s).toHaveLength(5);
    expect(s.every((x) => x.state === "done")).toBe(true);
    expect(s[0].date).toBe("May 12 to Sep 12");
    expect(s[0].desc).toBe("About 4 months of hand-weaving in Pile, Manabí");
    expect(s[3].desc).toBe("Shaped on a wooden form");
    expect(s[4].desc).toBe("Trimmed, banded and approved by Taller Pillco");
    expect(s[4].date).toBe("Oct 2");
  });

  it("marks the current and upcoming steps for a hat in production", () => {
    const p = {
      ...seed,
      stage: 1,
      events: [{ type: "stage_advanced", from_stage: 0, to_stage: 1, at: "2026-10-14T15:00:00Z" }],
    };
    const s = buildStory(p);
    expect(s[0].state).toBe("done");
    expect(s[1].state).toBe("current");
    expect(s[1].date).toBe("In progress since Oct 14");
    expect(s.slice(2).every((x) => x.state === "upcoming" && x.desc === "Not yet")).toBe(true);
    expect(certificateStatus(p)).toBe("In production · Washing since Oct 14, 2026");
  });

  it("shows Date not recorded for a done stage with no event", () => {
    const p = { ...seed, events: seed.events.filter((e) => e.to_stage !== 2) };
    expect(buildStory(p)[2]).toMatchObject({ state: "done", date: null, desc: "Date not recorded" });
  });

  it("certificate shows the finished date", () => {
    expect(certificateStatus(seed)).toBe("Finished Oct 2, 2026");
  });
});

describe("ownershipView", () => {
  it("recipient gets the Claim button", () => {
    expect(ownershipView({ ...seed, viewer: "recipient" })).toEqual({
      line: "Transferred to you on Oct 10, 2026. Claim it to register it in your name.",
      claim: "button",
    });
  });

  it("logged out gets the login claim", () => {
    const v = ownershipView(seed);
    expect(v.claim).toBe("login");
    expect(v.line).toBe("Transferred to a buyer on Oct 10, 2026. Log in to claim it if it's yours.");
    expect(showsClaim(v)).toBe(true);
  });

  it("anyone else sees no button (D21)", () => {
    for (const viewer of ["other", "owner"] as const) {
      const v = ownershipView({ ...seed, viewer });
      expect(v.line.endsWith("Waiting for them to claim it.")).toBe(true);
      expect(v.claim).toBe("none");
      expect(showsClaim(v)).toBe(false);
    }
  });

  it("owner and others after a claim", () => {
    const claimed = {
      ...seed,
      ownership: { owner_type: "buyer" as const, pending_transfer: false },
      events: [...seed.events, { type: "claimed", from_stage: null, to_stage: null, at: "2026-10-18T15:00:00Z" }],
    };
    expect(ownershipView({ ...claimed, viewer: "owner" })).toEqual({
      line: "Registered to you since Oct 18, 2026",
      claim: "owned",
    });
    expect(ownershipView({ ...claimed, viewer: "anonymous" })).toEqual({
      line: "Owned by a verified buyer since Oct 18, 2026",
      claim: "none",
    });
  });

  it("seller and workshop lines never name a person", () => {
    const base = { ...seed, ownership: { owner_type: "seller" as const, pending_transfer: false } };
    expect(ownershipView(base).line).toBe("With a verified seller.");
    expect(ownershipView({ ...base, ownership: { owner_type: "workshop", pending_transfer: false } }).line).toBe(
      "Held by Taller Pillco, the workshop that recorded it.",
    );
  });

  it("builds the chain", () => {
    expect(ownershipChain("seller").map((c) => c.state)).toEqual(["past", "current", "future"]);
  });
});

describe("meta and grade tip", () => {
  it("grade tip uses the handoff copy", () => {
    expect(gradeTip("Superfino")).toBe("Superfino means 25+ rows per inch. Fewer than 1 in 100 hats reach this grade.");
    expect(gradeTip("Nope")).toBeNull();
  });

  it("metadata has the weaver and no price", () => {
    const m = passportMeta({ ...seed, price_usd: 480 } as Passport);
    expect(m.title).toBe("Verified Superfino by Manuel Delgado · Toquilla Trace");
    expect(m.title + m.description).not.toContain("$");
    expect(m.description).toContain("Finished Oct 2, 2026.");
  });

  it("hidden weaver name falls back to the village", () => {
    const m = passportMeta({ ...seed, weaver: { ...seed.weaver!, name: null } });
    expect(m.title).toBe("Verified Superfino by a weaver from Pile · Toquilla Trace");
  });
});

describe("report a problem link", () => {
  it("emails the workshop when it has a contact address", () => {
    expect(reportHref("TQ-9A1M8", "hola@tallerpillco.com")).toBe(
      "mailto:hola@tallerpillco.com?subject=Problem%20with%20hat%20passport%20TQ-9A1M8",
    );
  });

  it("opens a GitHub issue instead of an email with no recipient", () => {
    expect(reportHref("TQ-ZZZZZ", null)).toBe(
      "https://github.com/xaviramirezcom/toquilla-trace/issues/new?title=Problem%20with%20hat%20passport%20TQ-ZZZZZ",
    );
    expect(reportHref(null, "")).toMatch(/issues\/new\?title=Problem%20with%20a%20hat%20passport$/);
  });
});
