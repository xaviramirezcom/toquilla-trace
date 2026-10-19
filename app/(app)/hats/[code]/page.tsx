import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { normalizeCode } from "@domain/domain";
import { HatDetailView, type HatLogRow } from "@/components/hats/HatDetailView";
import { getProfile } from "@/lib/auth/role";
import { getHatDetail } from "@/lib/hats/queries";
import { tryGetSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return { title: decodeURIComponent(code).toUpperCase() };
}

export default async function HatDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = normalizeCode(decodeURIComponent(raw));
  if (!code) notFound();
  const [profile, hat] = await Promise.all([getProfile(), getHatDetail(code)]);
  // Another workshop's hat is hidden by RLS, so it is a 404 as well.
  if (!hat || !profile) notFound();
  const isAdmin = profile.role === "admin";

  // Admin-only Logs tab. RLS returns nothing to members anyway; this skips the query for them.
  let logs: HatLogRow[] | null = null;
  if (isAdmin) {
    const supabase = await tryGetSupabaseServerClient();
    const res = await supabase
      ?.from("app_logs")
      .select("id, created_at, level, action, message, request_id")
      .eq("hat_code", hat.code)
      .order("id", { ascending: false })
      .limit(20);
    logs = (res?.data as HatLogRow[] | undefined) ?? [];
  }

  return (
    <HatDetailView
      hat={hat}
      actor={{ userId: profile.userId, workshopId: profile.workshopId, role: profile.role }}
      isAdmin={isAdmin}
      nowIso={new Date().toISOString()}
      logs={logs}
    />
  );
}
