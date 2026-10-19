"use server";
// Weaver writes (spec 08 section 6.5). User session; RLS limits writes to the member's workshop.
import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth/role";
import { tryGetSupabaseServerClient } from "@/lib/supabase/server";
import { copyFor, isDuplicateWeaver, mapDbError, validateWeaver, type WeaverInput } from "@/lib/hats/format";

export type SaveWeaverResult =
  | { ok: true; data: { id: string } }
  | { ok: false; code: string; message: string; fieldErrors?: Record<string, string> };

export async function saveWeaver(input: WeaverInput & { id?: string; force?: boolean }): Promise<SaveWeaverResult> {
  const errors = validateWeaver(input, new Date().getUTCFullYear());
  if (Object.keys(errors).length) return { ok: false, code: "invalid", message: "Check the highlighted fields.", fieldErrors: errors };

  const supabase = await tryGetSupabaseServerClient();
  const profile = await getProfile();
  if (!supabase || !profile) return { ok: false, code: "not_configured", message: copyFor("not_configured") };
  if (!profile.workshopId || profile.role === "admin") return { ok: false, code: "forbidden", message: copyFor("forbidden") };

  if (!input.id && !input.force) {
    const { data: existing } = await supabase
      .from("weavers")
      .select("id, name, village")
      .eq("workshop_id", profile.workshopId)
      .ilike("name", input.name.trim());
    if (isDuplicateWeaver(input, (existing ?? []) as { id: string; name: string; village: string | null }[])) {
      return {
        ok: false,
        code: "duplicate",
        message: `A weaver named ${input.name.trim()} from ${input.village.trim()} already exists. Add anyway?`,
      };
    }
  }

  const row = {
    name: input.name.trim(),
    village: input.village.trim(),
    province: input.province,
    specialty: input.specialty,
    weaving_since: input.weavingSince,
    bio: input.bio.trim() || null,
    show_name: input.showName,
  };
  const res = input.id
    ? await supabase.from("weavers").update(row).eq("id", input.id).select("id").maybeSingle()
    : await supabase
        .from("weavers")
        .insert({ ...row, workshop_id: profile.workshopId })
        .select("id")
        .maybeSingle();
  if (res.error) {
    const code = mapDbError(res.error);
    return { ok: false, code, message: copyFor(code) };
  }
  if (!res.data) return { ok: false, code: "forbidden", message: copyFor("forbidden") };
  revalidatePath("/weavers");
  return { ok: true, data: { id: (res.data as { id: string }).id } };
}
