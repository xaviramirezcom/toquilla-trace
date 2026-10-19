// Pure helpers behind the Hats and Weavers pages (lib/hats/format.ts), spec 08 sections 6 and 10.
import { describe, expect, it } from "vitest";
import {
  activityText,
  advanceBlockReason,
  copyFor,
  daysBetween,
  filterHats,
  hasActiveFilters,
  hatCountLabel,
  initials,
  isDuplicateWeaver,
  mapDbError,
  nextStageName,
  openFlags,
  passportLine,
  relativeTime,
  shortDate,
  timelineSteps,
  validateReason,
  validateWeaver,
  EMPTY_FILTERS,
} from "@/lib/hats/format";
import type { HatEvent, HatListRow } from "@/lib/hats/types";

const WS = "ws-1";
const member = { userId: "u1", workshopId: WS, role: "member" as const };
const baseHat = {
  code: "TQ-7F3K2",
  stage: 1,
  archived: false,
  workshop_id: WS,
  owner_type: "workshop" as const,
  owner_user_id: null,
  transfer_email: null,
};

describe("advanceBlockReason", () => {
  it("allows the owner workshop to advance", () => {
    expect(advanceBlockReason(baseHat, member)).toBeNull();
  });
  it("blocks a finished hat", () => {
    expect(advanceBlockReason({ ...baseHat, stage: 4 }, member)).toBe("This hat is finished.");
  });
  it("blocks a transferred hat", () => {
    expect(advanceBlockReason({ ...baseHat, owner_type: "buyer" }, member)).toBe("Only the current owner can change the stage.");
    expect(advanceBlockReason({ ...baseHat, transfer_email: "b@x.com" }, member)).toBe("Only the current owner can change the stage.");
  });
  it("blocks an archived hat", () => {
    expect(advanceBlockReason({ ...baseHat, archived: true }, member)).toBe("This hat is archived.");
  });
  it("blocks an admin from another workshop (admins read, never write)", () => {
    expect(advanceBlockReason(baseHat, { userId: "a", workshopId: "hq", role: "admin" })).toBe(
      "Only the current owner can change the stage.",
    );
  });
});

describe("mapDbError", () => {
  it("maps unique violations and known messages", () => {
    expect(mapDbError({ code: "23505", message: "dup" })).toBe("duplicate_code");
    expect(mapDbError({ message: "version_conflict" })).toBe("version_conflict");
    expect(mapDbError({ code: "40001", message: "version_conflict" })).toBe("version_conflict");
    expect(mapDbError({ message: "finished" })).toBe("finished");
  });
  it("prefers the longer code so weaver_not_found is not read as not_found", () => {
    expect(mapDbError({ message: "weaver_not_found" })).toBe("weaver_not_found");
  });
  it("maps a flag reviewed twice to already_reviewed", () => {
    expect(mapDbError({ code: "P0002", message: "not_found_or_reviewed" })).toBe("already_reviewed");
  });
  it("falls back to unknown", () => {
    expect(mapDbError({ message: "boom" })).toBe("unknown");
    expect(mapDbError(null)).toBe("unknown");
  });
  it("has copy for the conflict toast", () => {
    expect(copyFor("version_conflict")).toBe("Couldn't save this change. Someone may have updated this hat.");
    expect(copyFor("nope")).toBe("Something went wrong. Try again.");
  });
});

describe("activityText", () => {
  it("describes each event type", () => {
    expect(activityText({ type: "stage_advanced", to_stage: 2, note: null })).toBe("Moved to Bleaching");
    expect(activityText({ type: "created", to_stage: 0, note: null })).toBe("Created at Weaving");
    expect(activityText({ type: "transferred", to_stage: null, note: null }, "buyer")).toBe("Transferred to a buyer");
    expect(activityText({ type: "flag_reviewed", to_stage: null, note: "Recounted, it's 28." })).toBe(
      "Flag reviewed: 'Recounted, it's 28.'",
    );
  });
});

describe("dates", () => {
  const now = "2026-10-18T12:00:00Z";
  it("formats relative times", () => {
    expect(relativeTime("2026-10-18T11:59:30Z", now)).toBe("just now");
    expect(relativeTime("2026-10-18T11:55:00Z", now)).toBe("5 min ago");
    expect(relativeTime("2026-10-18T09:00:00Z", now)).toBe("3 h ago");
    expect(relativeTime("2026-10-17T10:00:00Z", now)).toBe("yesterday");
    expect(relativeTime("2026-10-15T10:00:00Z", now)).toBe("3 days ago");
    expect(relativeTime("2026-10-02T10:00:00Z", now)).toBe("Oct 2");
  });
  it("counts days and short dates", () => {
    expect(daysBetween("2026-10-14T08:00:00Z", now)).toBe(4);
    expect(shortDate("2026-10-14T08:00:00Z")).toBe("Oct 14");
  });
});

describe("timelineSteps", () => {
  const ev = (over: Partial<HatEvent>): HatEvent => ({
    id: Math.random().toString(),
    type: "stage_advanced",
    from_stage: null,
    to_stage: null,
    source: "manual",
    note: null,
    run_id: null,
    created_at: "2026-10-14T10:00:00Z",
    actor_name: "Xavier",
    ...over,
  });
  it("marks done, current and upcoming with dates and sources", () => {
    const steps = timelineSteps({ stage: 1, weaving_started_at: "2026-08-01T00:00:00Z", created_at: "2026-08-01T00:00:00Z" }, [
      ev({ type: "created", to_stage: 0, created_at: "2026-08-01T00:00:00Z" }),
      ev({ from_stage: 0, to_stage: 1, source: "ai_proposal", run_id: "r1" }),
    ]);
    expect(steps.map((s) => s.state)).toEqual(["done", "current", "upcoming", "upcoming", "upcoming"]);
    expect(steps[0]).toMatchObject({ actor: "Xavier", source: "manual", at: "2026-08-01T00:00:00Z" });
    expect(steps[1]).toMatchObject({ source: "ai_proposal", runId: "r1", at: "2026-10-14T10:00:00Z" });
    expect(steps[2].at).toBeNull();
  });
});

describe("hats list filters", () => {
  const row = (code: string, weaver: string, stage: number, grade: HatListRow["grade"], flagged = false): HatListRow => ({
    code,
    grade,
    rows_per_inch: 18,
    stage,
    owner_type: "workshop",
    transfer_email: null,
    updated_at: "2026-10-18T00:00:00Z",
    weaver: { name: weaver, village: "Sígsig" },
    flags: flagged ? [{ id: "f", message: "m", reviewed_at: null }] : [{ id: "g", message: "old", reviewed_at: "2026-10-01" }],
  });
  const rows = [
    row("TQ-7F3K2", "Rosa Pillco", 1, "Fino"),
    row("TQ-4K9D1", "Carmen Quizhpi", 3, "Superfino", true),
    row("TQ-2C5P0", "Rosa Guamán", 0, "Standard"),
  ];
  it("searches code without the dash and weaver without accents", () => {
    expect(filterHats(rows, { ...EMPTY_FILTERS, q: "7f3" }).map((h) => h.code)).toEqual(["TQ-7F3K2"]);
    expect(filterHats(rows, { ...EMPTY_FILTERS, q: "guaman" }).map((h) => h.code)).toEqual(["TQ-2C5P0"]);
    expect(filterHats(rows, { ...EMPTY_FILTERS, q: "rosa" })).toHaveLength(2);
  });
  it("filters flagged, stage and grade", () => {
    expect(filterHats(rows, { ...EMPTY_FILTERS, flagged: true }).map((h) => h.code)).toEqual(["TQ-4K9D1"]);
    expect(filterHats(rows, { ...EMPTY_FILTERS, stages: [0, 1] })).toHaveLength(2);
    expect(filterHats(rows, { ...EMPTY_FILTERS, grades: ["Fino"] }).map((h) => h.code)).toEqual(["TQ-7F3K2"]);
  });
  it("counts open flags only and labels counts", () => {
    expect(openFlags(rows[0].flags)).toHaveLength(0);
    expect(hatCountLabel(5, 5, false)).toBe("5 hats");
    expect(hatCountLabel(2, 5, true)).toBe("2 of 5 hats");
    expect(hatCountLabel(1, 1, false)).toBe("1 hat");
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, q: " x " })).toBe(true);
  });
  it("names the next stage", () => {
    expect(nextStageName(1)).toBe("Bleaching");
    expect(nextStageName(4)).toBeNull();
  });
});

describe("validateReason", () => {
  it("needs 3 to 300 characters after trimming", () => {
    expect(validateReason("  ok ")).not.toBeNull();
    expect(validateReason("Recounted, it's 28.")).toBeNull();
    expect(validateReason("x".repeat(301))).not.toBeNull();
  });
});

describe("weavers", () => {
  const base = { name: "Rosa Pillco", village: "Sígsig", province: "Azuay", specialty: ["Fino"], weavingSince: 1992, bio: "", showName: true };
  it("validates fields", () => {
    expect(validateWeaver(base, 2026)).toEqual({});
    const errors = validateWeaver({ ...base, name: " ", village: "", province: "Lima", weavingSince: 1930, bio: "x".repeat(201) }, 2026);
    expect(Object.keys(errors).sort()).toEqual(["bio", "name", "province", "village", "weavingSince"]);
  });
  it("detects duplicates case-insensitively and ignores the edited weaver", () => {
    const existing = [{ id: "w1", name: "Rosa Pillco", village: "Sígsig" }];
    expect(isDuplicateWeaver({ name: "rosa pillco ", village: "sígsig" }, existing)).toBe(true);
    expect(isDuplicateWeaver({ name: "rosa pillco", village: "sígsig" }, existing, "w1")).toBe(false);
    expect(isDuplicateWeaver({ name: "Rosa Pillco", village: "Cuenca" }, existing)).toBe(false);
  });
  it("builds initials and the passport preview line", () => {
    expect(initials("Rosa Pillco")).toBe("RP");
    expect(initials("Manuel")).toBe("M");
    expect(passportLine("Rosa Pillco", "Sígsig", true)).toBe("Hand-woven by Rosa Pillco in Sígsig");
    expect(passportLine("Rosa Pillco", "Sígsig", false)).toBe("A master weaver from Sígsig");
  });
});
