// In-memory DataLayer with the handoff sample data (dependency injection, not a mock of the code
// under test). Shared by the tool, loop and concierge tests.
import type { Actor, HatEventLike } from "@domain/domain";
import { createRunContext, type DataLayer, type HatRow, type RunContext, type WeaverRow } from "@domain/tools";

export const WS = "ws1";
export const NOW = "2026-10-18T12:00:00.000Z";

export const WEAVERS: WeaverRow[] = [
  { id: "w1", name: "Rosa Pillco", village: "Sígsig", province: "Azuay", specialty: ["Fino"] },
  { id: "w2", name: "Rosa Guamán", village: "Cuenca", province: "Azuay", specialty: ["Standard"] },
  { id: "w3", name: "Manuel Delgado", village: "Pile", province: "Manabí", specialty: ["Superfino"] },
  { id: "w4", name: "Carmen Quizhpi", village: "Cuenca", province: "Azuay", specialty: ["Fino"] },
];

function hat(p: Partial<HatRow> & Pick<HatRow, "id" | "code" | "grade" | "rows_per_inch" | "stage">): HatRow {
  return {
    workshop_id: WS,
    weaver_id: null,
    straw: "Natural",
    owner_type: "workshop",
    owner_user_id: null,
    transfer_email: null,
    archived: false,
    version: 1,
    weaving_started_at: "2026-08-01T00:00:00.000Z",
    created_at: "2026-08-01T00:00:00.000Z",
    ...p,
  };
}

export function sampleHats(): HatRow[] {
  return [
    hat({ id: "h1", code: "TQ-7F3K2", grade: "Fino", rows_per_inch: 18, weaver_id: "w1", stage: 1, version: 2 }),
    hat({
      id: "h2",
      code: "TQ-9A1M8",
      grade: "Superfino",
      rows_per_inch: 32,
      weaver_id: "w3",
      stage: 4,
      owner_type: "buyer",
      owner_user_id: "buyer1",
      version: 6,
    }),
    hat({ id: "h3", code: "TQ-2C5P0", grade: "Standard", rows_per_inch: 10, weaver_id: "w2", stage: 0 }),
    hat({ id: "h4", code: "TQ-4K9D1", grade: "Superfino", rows_per_inch: 18, weaver_id: "w4", stage: 3, version: 4 }),
    hat({ id: "h5", code: "TQ-8B2N4", grade: "Fino", rows_per_inch: 20, weaver_id: "w4", stage: 1, version: 2 }),
    hat({ id: "h6", code: "TQ-OLD11", grade: "Fino", rows_per_inch: 18, weaver_id: "w1", stage: 2, archived: true }),
  ];
}

export function fakeData(
  opts: { hats?: HatRow[]; flags?: Record<string, { kind: string; message: string }[]>; openProposalHats?: string[] } = {},
) {
  const hats = opts.hats ?? sampleHats();
  const events: Record<string, HatEventLike[]> = {
    h1: [
      { type: "created", from_stage: null, to_stage: 0, created_at: "2026-08-01T00:00:00.000Z" },
      { type: "stage_advanced", from_stage: 0, to_stage: 1, created_at: "2026-09-20T00:00:00.000Z" },
    ],
  };
  const calls: string[] = [];
  const data: DataLayer = {
    async listWeavers() {
      calls.push("listWeavers");
      return WEAVERS;
    },
    async listHats() {
      calls.push("listHats");
      return hats;
    },
    async getHatByCode(code) {
      calls.push(`getHatByCode:${code}`);
      return hats.find((h) => h.code === code) ?? null;
    },
    async getEvents(hatId) {
      return events[hatId] ?? [];
    },
    async getOpenFlags(hatId) {
      return opts.flags?.[hatId] ?? [];
    },
    async hasOpenProposal(hatId) {
      return (opts.openProposalHats ?? []).includes(hatId);
    },
  };
  return { data, hats, calls };
}

export const MEMBER: Actor = { userId: "u1", workshopId: WS, role: "member" };

export function ctxFor(note: string, extra: { hatTag?: string | null; data?: DataLayer } = {}): RunContext {
  return createRunContext({
    note,
    hatTag: extra.hatTag ?? null,
    actor: MEMBER,
    data: extra.data ?? fakeData().data,
    now: () => NOW,
  });
}

export const SAMPLE_NOTE =
  "Doña Rosa terminó 3 finos de 18 hileras. El TQ-7F3K2 ya está lavado, pasa a blanqueo. El TQ-2C5P0 ya está listo. Y el de Carmen dice superfino pero tiene 18 hileras.";
