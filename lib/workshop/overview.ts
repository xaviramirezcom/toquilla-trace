import "server-only";
// Server-side reads for the Workshop page (RLS as the signed-in user). Every query is filtered to
// the user's own workshop: admins can read everything (RLS), but the dashboard is about their own.
// Any failure returns null for that piece so the page still renders.
import type { Profile } from "@/lib/auth/types";
import { tryGetSupabaseServerClient } from "@/lib/supabase/server";
import type { ActivityEvent } from "./format";

export interface TodayStats {
  inProgress: number;
  finishedThisWeek: number;
  waitingForReview: number;
  flagsToCheck: number;
}

export interface WorkshopOverview {
  stats: TodayStats | null;
  activity: ActivityEvent[] | null;
  hatCount: number | null;
  weaverCount: number | null;
  proposalCount: number | null;
}

const EMPTY: WorkshopOverview = { stats: null, activity: null, hatCount: null, weaverCount: null, proposalCount: null };

interface EventRow {
  id: string;
  type: string;
  from_stage: number | null;
  to_stage: number | null;
  source: string | null;
  actor_id: string | null;
  created_at: string;
  hats: { code: string } | { code: string }[] | null;
}

export async function loadWorkshopOverview(profile: Profile): Promise<WorkshopOverview> {
  const wid = profile.workshopId;
  if (!wid) return EMPTY;
  try {
    const supabase = await tryGetSupabaseServerClient();
    if (!supabase) return EMPTY;
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    const [inProgress, finished, waiting, flags, hats, weavers, proposals, events] = await Promise.all([
      supabase
        .from("hats")
        .select("id", { count: "exact", head: true })
        .eq("workshop_id", wid)
        .eq("archived", false)
        .lt("stage", 4),
      supabase
        .from("hat_events")
        .select("id, hats!inner(workshop_id)", { count: "exact", head: true })
        .eq("hats.workshop_id", wid)
        .eq("type", "stage_advanced")
        .eq("to_stage", 4)
        .gte("created_at", weekAgo),
      supabase
        .from("proposals")
        .select("id", { count: "exact", head: true })
        .eq("workshop_id", wid)
        .in("status", ["pending", "question", "blocked", "failed"]),
      supabase
        .from("hat_flags")
        .select("id, hats!inner(workshop_id)", { count: "exact", head: true })
        .eq("hats.workshop_id", wid)
        .is("reviewed_at", null),
      supabase.from("hats").select("id", { count: "exact", head: true }).eq("workshop_id", wid),
      supabase.from("weavers").select("id", { count: "exact", head: true }).eq("workshop_id", wid),
      supabase.from("proposals").select("id", { count: "exact", head: true }).eq("workshop_id", wid),
      supabase
        .from("hat_events")
        .select("id, type, from_stage, to_stage, source, actor_id, created_at, hats!inner(code, workshop_id)")
        .eq("hats.workshop_id", wid)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const statsOk = !inProgress.error && !finished.error && !waiting.error && !flags.error;
    const stats: TodayStats | null = statsOk
      ? {
          inProgress: inProgress.count ?? 0,
          finishedThisWeek: finished.count ?? 0,
          waitingForReview: waiting.count ?? 0,
          flagsToCheck: flags.count ?? 0,
        }
      : null;

    const activity: ActivityEvent[] | null = events.error
      ? null
      : ((events.data ?? []) as unknown as EventRow[]).map((r) => {
          const hat = Array.isArray(r.hats) ? r.hats[0] : r.hats;
          return {
            id: r.id,
            type: r.type,
            from_stage: r.from_stage,
            to_stage: r.to_stage,
            source: r.source,
            actor_id: r.actor_id,
            created_at: r.created_at,
            hat_code: hat?.code ?? "Hat",
          };
        });

    return {
      stats,
      activity,
      hatCount: hats.error ? null : (hats.count ?? 0),
      weaverCount: weavers.error ? null : (weavers.count ?? 0),
      proposalCount: proposals.error ? null : (proposals.count ?? 0),
    };
  } catch {
    return EMPTY;
  }
}
