// Contract for supabase/functions/_shared/domain.ts. Case numbers follow docs/specs/05-domain-rules.md section 10.
import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  HAT_CODE_RE,
  NEW_HAT_STAGE,
  canAdvance,
  canClaim,
  canTransfer,
  canonicalCode,
  detectAnomalies,
  foldText,
  generateCode,
  gradeFor,
  gradeMismatch,
  gradeMismatchMessage,
  isValidCode,
  matchCode,
  matchWeavers,
  minWeavingDays,
  nextStage,
  normalizeCode,
  quoteInNote,
  stageIndex,
  stageName,
  validateHatFields,
  validateRows,
  type Actor,
  type HatEventLike,
  type HatLike,
} from "@domain/domain";

const base: HatLike = {
  code: "TQ-2C5P0",
  workshop_id: "w1",
  weaver_id: "v2",
  grade: "Standard",
  rows_per_inch: 10,
  stage: 0,
  owner_type: "workshop",
  owner_user_id: null,
  transfer_email: null,
  archived: false,
  weaving_started_at: null,
  created_at: "2026-10-01T00:00:00Z",
};

const member: Actor = { userId: "u1", workshopId: "w1", role: "member", email: "xavier@tallerpillco.com" };

const W = [
  { id: "v1", name: "Rosa Pillco" },
  { id: "v2", name: "Rosa Guamán" },
  { id: "v3", name: "Manuel Delgado" },
  { id: "v4", name: "Carmen Quizhpi" },
];

/** Open hats from the handoff sample data (TQ-9A1M8 is Finished, so it is not open). */
const OPEN = ["TQ-7F3K2", "TQ-2C5P0", "TQ-4K9D1", "TQ-8B2N4"];

const SAMPLE_NOTE =
  "Doña Rosa terminó 3 finos de 18 hileras. El TQ-7F3K2 ya está lavado, pasa a blanqueo. El TQ-2C5P0 ya está listo. Y el de Carmen dice superfino pero tiene 18 hileras.";

function toWashing(at: string): HatEventLike {
  return { type: "stage_advanced", from_stage: 0, to_stage: 1, created_at: at };
}

const names = (ws: { name: string }[]) => ws.map((w) => w.name);

describe("stage machine", () => {
  it.each([
    [1, 0, 1],
    [2, 3, 4],
    [3, 4, null],
  ] as const)("case %i: nextStage(%i) is %s", (_n, from, expected) => {
    expect(nextStage(from)).toBe(expected);
  });

  it("cases 4 to 6: stageIndex reads trimmed English names only", () => {
    expect(stageIndex("Bleaching")).toBe(2);
    expect(stageIndex(" bleaching ")).toBe(2);
    expect(stageIndex("blanqueo")).toBeNull();
  });

  it("case 7: stageName(5) is null", () => {
    expect(stageName(5)).toBeNull();
    expect(stageName(0)).toBe("Weaving");
  });

  it("D15: new hats start at Weaving", () => {
    expect(NEW_HAT_STAGE).toBe(0);
  });
});

describe("canAdvance", () => {
  it("case 8: one step forward is allowed", () => {
    expect(canAdvance(base, 1, member)).toEqual({ allowed: true });
  });

  it("case 9: Washing to Bleaching is allowed", () => {
    expect(canAdvance({ ...base, code: "TQ-7F3K2", stage: 1 }, 2, member)).toEqual({ allowed: true });
  });

  it("case 10: skipping is blocked with the next allowed stage as the fix", () => {
    expect(canAdvance(base, 4, member)).toEqual({
      allowed: false,
      code: "stage_skip",
      message: "Can't move TQ-2C5P0 from Weaving to Finished. Next allowed stage: Washing.",
      fix: { to_stage: 1 },
    });
  });

  it.each([
    [11, { ...base, stage: 3 }, 1, member, "backward", "Stages only move forward. TQ-2C5P0 is at Blocking."],
    [12, { ...base, stage: 1 }, 1, member, "same_stage", "TQ-2C5P0 is already at Washing."],
    [13, { ...base, stage: 4 }, 4, member, "already_finished", "TQ-2C5P0 is already Finished."],
    [14, { ...base, archived: true }, 1, member, "archived", "Archived hats can't change stage."],
    [15, { ...base, workshop_id: "w2" }, 1, member, "not_owner", "Only the current owner can change the stage."],
    [
      16,
      { ...base, owner_type: "seller" as const, owner_user_id: "u9" },
      1,
      member,
      "not_owner",
      "Only the current owner can change the stage.",
    ],
    [
      17,
      base,
      1,
      { ...member, workshopId: "w2", role: "admin" as const },
      "not_owner",
      "Only the current owner can change the stage.",
    ],
    [
      19,
      { ...base, owner_type: "buyer" as const, owner_user_id: null, stage: 4 },
      4,
      member,
      "not_owner",
      "Only the current owner can change the stage.",
    ],
    [20, base, 7, member, "invalid_stage", "That stage doesn't exist."],
  ])("case %i: blocked", (_n, hat, to, actor, code, message) => {
    const r = canAdvance(hat, to, actor);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.code).toBe(code);
      expect(r.message).toBe(message);
    }
  });

  it("case 18: a seller who owns the hat can advance it", () => {
    expect(canAdvance({ ...base, owner_type: "seller", owner_user_id: "u1", stage: 3 }, 4, member)).toEqual({
      allowed: true,
    });
  });
});

describe("grades", () => {
  it.each([
    [21, 8, "Standard"],
    [21, 14, "Standard"],
    [22, 15, "Fino"],
    [22, 24, "Fino"],
    [23, 25, "Superfino"],
    [23, 40, "Superfino"],
    [24, 7, null],
    [25, 41, null],
    [26, 18.5, null],
  ])("case %i: gradeFor(%d) is %s", (_n, rows, expected) => {
    expect(gradeFor(rows)).toBe(expected);
  });

  it.each([
    [27, "Fino", 18, false],
    [28, "Superfino", 18, true],
    [29, "Standard", 15, true],
    [30, "Standard", 6, true],
  ] as const)("case %i: gradeMismatch(%s, %d) is %s", (_n, grade, rows, expected) => {
    expect(gradeMismatch(grade, rows)).toBe(expected);
  });

  it("cases 31 to 33: gradeMismatchMessage", () => {
    expect(gradeMismatchMessage("Superfino", 18)).toBe("18 rows/inch usually means Fino.");
    expect(gradeMismatchMessage("Standard", 7)).toBe("7 rows/inch is below the Standard range (8 to 14).");
    expect(gradeMismatchMessage("Fino", 18)).toBeNull();
  });

  it("case 34: validateRows accepts 6 and 40", () => {
    expect(validateRows(6)).toBeNull();
    expect(validateRows(40)).toBeNull();
  });

  it.each([5, 41, 12.5])("case 35: validateRows(%d) is an error", (rows) => {
    expect(validateRows(rows)).toBe("Rows per inch must be between 6 and 40.");
  });
});

describe("hat codes", () => {
  it("cases 36 to 38: isValidCode is strict", () => {
    expect(isValidCode("TQ-7F3K2")).toBe(true);
    expect(isValidCode("TQ-9A1M8")).toBe(true);
    expect(isValidCode("tq-7f3k2")).toBe(false);
    expect(isValidCode("TQ-7F3K")).toBe(false);
    expect(isValidCode("TQ7F3K2")).toBe(false);
  });

  it.each([
    [39, "tq 7f3k2", "TQ-7F3K2"],
    [40, "TQ7F3K2", "TQ-7F3K2"],
    [41, "  TQ-7f3k2. ", "TQ-7F3K2"],
    [42, "7f3k2", "TQ-7F3K2"],
    [43, "TQ-7F3K", null],
    [44, "hola mundo", null],
    [45, "TQ-2C5PO", "TQ-2C5PO"],
  ])("case %i: normalizeCode(%j) is %s", (_n, input, expected) => {
    expect(normalizeCode(input)).toBe(expected);
  });

  it.each(["\u2010", "\u2011", "\u2012", "\u2013", "\u2014", "\u2212"])(
    "normalizeCode maps the Unicode dash %j to a hyphen",
    (dash) => {
      expect(normalizeCode(`TQ${dash}7F3K2`)).toBe("TQ-7F3K2");
      expect(normalizeCode(`tq ${dash} 7f3k2`)).toBe("TQ-7F3K2");
    },
  );

  it("rule 9: normalizeCode is idempotent", () => {
    for (const input of ["tq 7f3k2", "7f3k2", "TQ-2C5PO"]) {
      const once = normalizeCode(input);
      expect(once).not.toBeNull();
      expect(normalizeCode(once as string)).toBe(once);
    }
  });

  it("cases 46 and 47: canonicalCode maps O to 0 and I/L to 1", () => {
    expect(canonicalCode("TQ-2C5PO")).toBe("TQ-2C5P0");
    expect(canonicalCode("TQ-9AIM8")).toBe("TQ-9A1M8");
    expect(canonicalCode("TQ-4K9DL")).toBe("TQ-4K9D1");
  });

  it.each([
    [48, "tq 7f3k2", OPEN, { kind: "exact", code: "TQ-7F3K2" }],
    [49, "TQ-2C5PO", OPEN, { kind: "confusable", code: "TQ-2C5P0" }],
    [50, "TQ-7F3KZ", OPEN, { kind: "fuzzy", code: "TQ-7F3K2" }],
    [51, "TQ-7F3K", OPEN, { kind: "fuzzy", code: "TQ-7F3K2" }],
    [52, "TQ-ZZZZZ", OPEN, { kind: "none" }],
    [53, "TQ-AAAA3", ["TQ-AAAA1", "TQ-AAAA2"], { kind: "ambiguous", candidates: ["TQ-AAAA1", "TQ-AAAA2"] }],
    [54, "TQ-7F3K2", ["TQ-7F3K2", "TQ-7F3K3"], { kind: "exact", code: "TQ-7F3K2" }],
  ])("case %i: matchCode(%j)", (_n, input, candidates, expected) => {
    expect(matchCode(input, candidates)).toEqual(expected);
  });

  it("case 55: generateCode(() => 0)", () => {
    expect(generateCode(() => 0)).toBe("TQ-AAAAA");
  });

  it("case 56: generateCode(() => 0.9999)", () => {
    expect(generateCode(() => 0.9999)).toBe("TQ-99999");
  });

  it("generateCode clamps rand() === 1 to the last character", () => {
    expect(generateCode(() => 1)).toBe("TQ-99999");
  });

  it("case 57: 1000 random codes are valid and never use I, O, 0 or 1", () => {
    for (let i = 0; i < 1000; i++) {
      const code = generateCode(Math.random);
      expect(code).toMatch(HAT_CODE_RE);
      expect(code.slice(3)).not.toMatch(/[IO01]/);
    }
    expect(CODE_ALPHABET).not.toMatch(/[IO01]/);
  });
});

describe("text helpers", () => {
  it("case 58: foldText", () => {
    expect(foldText("  Doña  ROSA ")).toBe("dona rosa");
  });

  it.each([
    [59, "terminó 3 finos de 18 hileras", SAMPLE_NOTE, true],
    [60, "el tq-7f3k2 ya esta lavado", SAMPLE_NOTE, true],
    [61, "“ya está listo.”", SAMPLE_NOTE, true],
    [62, "terminó 4 finos", SAMPLE_NOTE, false],
    [63, "ok", "ok gracias", false],
  ])("case %i: quoteInNote(%j)", (_n, quote, note, expected) => {
    expect(quoteInNote(quote, note)).toBe(expected);
  });

  it("case 64: Rosa and Doña Rosa return both Rosas", () => {
    expect(names(matchWeavers("Rosa", W))).toEqual(["Rosa Guamán", "Rosa Pillco"]);
    expect(names(matchWeavers("Doña Rosa", W))).toEqual(["Rosa Guamán", "Rosa Pillco"]);
  });

  it("case 65: full name returns one weaver", () => {
    expect(names(matchWeavers("rosa pillco", W))).toEqual(["Rosa Pillco"]);
  });

  it("case 66: accents are ignored", () => {
    expect(names(matchWeavers("guaman", W))).toEqual(["Rosa Guamán"]);
  });

  it("case 67: unknown names and bare honorifics return nothing", () => {
    expect(matchWeavers("Lucía", W)).toEqual([]);
    expect(matchWeavers("Doña", W)).toEqual([]);
  });
});

describe("anomalies", () => {
  it("case 68: minWeavingDays", () => {
    expect(minWeavingDays("Standard")).toBe(2);
    expect(minWeavingDays("Fino")).toBe(14);
    expect(minWeavingDays("Superfino")).toBe(60);
  });

  it("case 69: grade mismatch on TQ-4K9D1", () => {
    expect(detectAnomalies({ ...base, code: "TQ-4K9D1", grade: "Superfino", rows_per_inch: 18, stage: 3 }, [])).toEqual(
      [{ kind: "grade_mismatch", message: "18 rows/inch usually means Fino." }],
    );
  });

  it("case 70: Superfino woven in 23 days is too fast", () => {
    const hat = { ...base, grade: "Superfino" as const, rows_per_inch: 32, weaving_started_at: "2026-09-01T00:00:00Z" };
    expect(detectAnomalies(hat, [toWashing("2026-09-24T00:00:00Z")])).toEqual([
      { kind: "too_fast", message: "Woven in 23 days. Superfino usually takes at least 60." },
    ]);
  });

  it("case 71: Fino woven in 20 days is fine", () => {
    const hat = { ...base, grade: "Fino" as const, rows_per_inch: 18, weaving_started_at: "2026-09-01T00:00:00Z" };
    expect(detectAnomalies(hat, [toWashing("2026-09-21T00:00:00Z")])).toEqual([]);
  });

  it("case 72: exactly the minimum is fine (strict comparison)", () => {
    const hat = { ...base, weaving_started_at: "2026-10-01T00:00:00Z" };
    expect(detectAnomalies(hat, [toWashing("2026-10-03T00:00:00Z")])).toEqual([]);
  });

  it("case 73: still weaving, no event, is not flagged", () => {
    const hat = { ...base, weaving_started_at: "2026-10-17T00:00:00Z" };
    expect(detectAnomalies(hat, [], "2026-10-18T00:00:00Z")).toEqual([]);
  });

  it("case 74: a simulated move to Washing at now is checked", () => {
    const hat = { ...base, weaving_started_at: "2026-10-17T00:00:00Z" };
    const now = "2026-10-18T00:00:00Z";
    expect(detectAnomalies(hat, [toWashing(now)], now)).toEqual([
      { kind: "too_fast", message: "Woven in 1 days. Standard usually takes at least 2." },
    ]);
  });

  it("case 75: unknown start date never raises too_fast", () => {
    const anomalies = detectAnomalies({ ...base, weaving_started_at: null }, [toWashing("2026-10-02T00:00:00Z")]);
    expect(anomalies.map((a) => a.kind)).not.toContain("too_fast");
  });

  it("case 76: missing weaver", () => {
    expect(detectAnomalies({ ...base, weaver_id: null }, [])).toEqual([
      { kind: "weaver_not_found", message: "No weaver is linked to this hat." },
    ]);
  });
});

describe("transfer and claim", () => {
  it("case 77: workshop to seller is allowed", () => {
    expect(canTransfer(base, member, "seller", "ana@shop.com")).toEqual({ allowed: true });
  });

  it("case 78: invalid email", () => {
    const r = canTransfer(base, member, "seller", "ana@");
    expect(r).toMatchObject({ allowed: false, code: "invalid_email", message: "Enter a valid email." });
  });

  it("case 79: a buyer is the end of the chain", () => {
    const r = canTransfer({ ...base, owner_type: "buyer", owner_user_id: "u1" }, member, "buyer", "b@x.com");
    expect(r).toMatchObject({ allowed: false, code: "end_of_chain" });
  });

  it("case 80: non-owner cannot transfer", () => {
    const r = canTransfer({ ...base, workshop_id: "w2" }, member, "seller", "ana@shop.com");
    expect(r).toMatchObject({ allowed: false, code: "not_owner" });
  });

  it("case 81: claim with a matching email, case-insensitive", () => {
    expect(canClaim({ ...base, transfer_email: "Ana@Shop.com" }, { ...member, email: "ana@shop.com" })).toEqual({
      allowed: true,
    });
  });

  it("case 82: claim with a different email", () => {
    expect(canClaim({ ...base, transfer_email: "ana@shop.com" }, member)).toMatchObject({
      allowed: false,
      code: "not_recipient",
    });
  });

  it("case 83: claim with no pending transfer", () => {
    expect(canClaim(base, member)).toMatchObject({ allowed: false, code: "no_transfer" });
  });
});

describe("validateHatFields", () => {
  it("case 84: quantity range", () => {
    expect(validateHatFields({ quantity: 0 })).toEqual({ quantity: "Quantity must be between 1 and 20." });
    expect(validateHatFields({ quantity: 21 })).toEqual({ quantity: "Quantity must be between 1 and 20." });
  });

  it("case 85: size range", () => {
    expect(validateHatFields({ size_cm: 51 })).toEqual({ size_cm: "Size must be between 52 and 64 cm." });
  });

  it("case 86: negative price", () => {
    expect(validateHatFields({ price_usd: -1 })).toEqual({ price_usd: "Price can't be negative." });
  });

  it("case 87: valid fields", () => {
    expect(validateHatFields({ quantity: 3, rows_per_inch: 18, grade: "Fino", straw: "Natural" })).toEqual({});
  });
});
