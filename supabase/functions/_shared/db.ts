// Supabase implementation of the tools DataLayer. Reads go through the user's client (RLS applies)
// and every query also filters by the actor's workshop, so an admin's agent never reads other
// workshops. No writes here.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import type { HatEventLike } from "./domain.ts";
import type { DataLayer, HatRow, WeaverRow } from "./tools.ts";

const HAT_COLUMNS =
  "id, code, workshop_id, weaver_id, grade, rows_per_inch, straw, stage, owner_type, owner_user_id, transfer_email, archived, version, weaving_started_at, created_at";

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

export function supabaseDataLayer(client: SupabaseClient, workshopId: string): DataLayer {
  return {
    async listWeavers() {
      const res = await client
        .from("weavers")
        .select("id, name, village, province, specialty")
        .eq("workshop_id", workshopId)
        .order("name")
        .limit(500);
      return check(res, "weavers") as WeaverRow[];
    },
    async listHats() {
      const res = await client.from("hats").select(HAT_COLUMNS).eq("workshop_id", workshopId).order("code").limit(2000);
      return check(res, "hats") as HatRow[];
    },
    async getHatByCode(code) {
      const res = await client
        .from("hats")
        .select(HAT_COLUMNS)
        .eq("workshop_id", workshopId)
        .eq("code", code)
        .maybeSingle();
      return (check(res, "hat") as HatRow | null) ?? null;
    },
    async getEvents(hatId) {
      const res = await client
        .from("hat_events")
        .select("type, from_stage, to_stage, created_at")
        .eq("hat_id", hatId)
        .order("created_at")
        .limit(200);
      return check(res, "events") as HatEventLike[];
    },
    async getOpenFlags(hatId) {
      const res = await client
        .from("hat_flags")
        .select("kind, message")
        .eq("hat_id", hatId)
        .is("reviewed_at", null)
        .limit(50);
      return check(res, "flags") as { kind: string; message: string }[];
    },
    async hasOpenProposal(hatId) {
      const res = await client
        .from("proposals")
        .select("id")
        .eq("workshop_id", workshopId)
        .in("status", ["pending", "question"])
        .eq("payload->>hat_id", hatId)
        .limit(1);
      const rows = check(res, "proposals") as { id: string }[];
      return rows.length > 0;
    },
  };
}
