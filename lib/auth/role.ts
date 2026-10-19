import "server-only";
import { cache } from "react";
import { tryGetSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "./types";

export type { Profile, Role } from "./types";

interface ProfileRow {
  id: string;
  name: string | null;
  role: string | null;
  workshop_id: string | null;
  workshops: { name: string | null; city: string | null } | null;
}

/**
 * The signed-in user's profile, or null when signed out, unconfigured or on any error.
 * Reads `profiles` (own row, RLS) joined to `workshops`. Cached per request.
 * The role is display only here: authorization is enforced by RLS and Edge Functions.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  try {
    const supabase = await tryGetSupabaseServerClient();
    if (!supabase) return null;
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData?.user;
    if (userError || !user) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, role, workshop_id, workshops(name, city)")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>();
    if (error || !data) {
      return {
        userId: user.id,
        email: user.email ?? null,
        name: user.email?.split("@")[0] ?? "You",
        workshopId: null,
        workshopName: null,
        workshopCity: null,
        role: "member",
      };
    }
    return {
      userId: data.id,
      email: user.email ?? null,
      name: data.name?.trim() || user.email?.split("@")[0] || "You",
      workshopId: data.workshop_id,
      workshopName: data.workshops?.name ?? null,
      workshopCity: data.workshops?.city ?? null,
      role: data.role === "admin" ? "admin" : "member",
    };
  } catch {
    return null;
  }
});

export async function isAdmin(): Promise<boolean> {
  return (await getProfile())?.role === "admin";
}
