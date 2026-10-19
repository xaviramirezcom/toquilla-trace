import "server-only";
// Server reads for the hats and weavers pages. User session, so RLS limits members to their workshop
// and gives admins read access to everything (spec 01). Errors throw so the route error.tsx shows.
import { tryGetSupabaseServerClient } from "@/lib/supabase/server";
import type { HatDetail, HatEvent, HatFlag, HatListRow, WeaverRow } from "./types";

type One<T> = T | T[] | null;
function one<T>(v: One<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function listHats(): Promise<HatListRow[]> {
  const supabase = await tryGetSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("hats")
    .select(
      "code, grade, rows_per_inch, stage, owner_type, transfer_email, updated_at, weaver:weavers(name, village), flags:hat_flags(id, message, reviewed_at)",
    )
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`hats list: ${error.message}`);
  return (data ?? []).map((r) => {
    const row = r as unknown as Omit<HatListRow, "weaver"> & { weaver: One<HatListRow["weaver"]> };
    return { ...row, weaver: one(row.weaver), flags: row.flags ?? [] };
  });
}

interface RawEvent extends Omit<HatEvent, "actor_name"> {
  actor_id: string | null;
}
type RawFlag = Omit<HatFlag, "reviewer_name">;

export async function getHatDetail(code: string): Promise<HatDetail | null> {
  const supabase = await tryGetSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("hats")
    .select(
      "id, code, workshop_id, weaver_id, grade, rows_per_inch, straw, size_cm, price_usd, stage, owner_type, owner_user_id, transfer_email, archived, version, weaving_started_at, created_at, updated_at, weaver:weavers(id, name, village), workshop:workshops(name)",
    )
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(`hat detail: ${error.message}`);
  if (!data) return null;
  const hat = data as unknown as Omit<HatDetail, "weaver" | "workshop_name" | "events" | "flags"> & {
    weaver: One<HatDetail["weaver"]>;
    workshop: One<{ name: string | null }>;
  };

  const [eventsRes, flagsRes] = await Promise.all([
    supabase
      .from("hat_events")
      .select("id, type, from_stage, to_stage, source, note, run_id, created_at, actor_id")
      .eq("hat_id", hat.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("hat_flags")
      .select("id, kind, message, raised_by, reviewed_by, review_reason, reviewed_at, created_at")
      .eq("hat_id", hat.id)
      .order("created_at", { ascending: true }),
  ]);
  if (eventsRes.error) throw new Error(`hat events: ${eventsRes.error.message}`);
  // Flags are a Nice panel: a missing join or column should not break the page.
  const rawFlags = flagsRes.error ? [] : ((flagsRes.data ?? []) as unknown as RawFlag[]);

  const rawEvents = (eventsRes.data ?? []) as unknown as RawEvent[];

  // Actor names in one extra query (no dependency on a hat_events -> profiles foreign key).
  const ids = [
    ...new Set([...rawEvents.map((e) => e.actor_id), ...rawFlags.map((f) => f.reviewed_by)].filter(Boolean)),
  ] as string[];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: people } = await supabase.from("profiles").select("id, name").in("id", ids);
    for (const p of (people ?? []) as { id: string; name: string | null }[]) if (p.name) names.set(p.id, p.name);
  }

  const events: HatEvent[] = rawEvents.map(({ actor_id, ...e }) => ({
    ...e,
    actor_name: actor_id ? (names.get(actor_id) ?? null) : null,
  }));
  const flags: HatFlag[] = rawFlags.map((f) => ({
    ...f,
    reviewer_name: f.reviewed_by ? (names.get(f.reviewed_by) ?? null) : null,
  }));

  const { weaver, workshop, ...rest } = hat;
  return { ...rest, weaver: one(weaver), workshop_name: one(workshop)?.name ?? null, events, flags };
}

export async function listWeavers(): Promise<WeaverRow[]> {
  const supabase = await tryGetSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("weavers")
    .select("id, name, village, province, specialty, weaving_since, bio, show_name, hats(count)")
    .order("name", { ascending: true });
  if (error) throw new Error(`weavers list: ${error.message}`);
  return (data ?? []).map((r) => {
    const row = r as unknown as Omit<WeaverRow, "hat_count"> & { hats: { count: number }[] | null };
    const { hats, ...rest } = row;
    return { ...rest, specialty: rest.specialty ?? [], hat_count: hats?.[0]?.count ?? 0 };
  });
}
