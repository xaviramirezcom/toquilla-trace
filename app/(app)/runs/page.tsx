import type { Metadata } from "next";
import { normalizeCode } from "@domain/domain";
import { AdminOnly } from "@/components/admin/AdminOnly";
import { RunsList } from "@/components/admin/RunsList";
import { listRuns } from "@/lib/admin/queries";
import { runDateStart } from "@/lib/admin/runs";
import { getProfile } from "@/lib/auth/role";

export const metadata: Metadata = { title: "Agent runs" };
export const dynamic = "force-dynamic";

export default async function RunsPage({ searchParams }: { searchParams: Promise<{ hat?: string }> }) {
  const profile = await getProfile();
  // UX guard only. RLS (is_admin()) returns zero agent_runs rows to members.
  if (profile?.role !== "admin") return <AdminOnly page="Agent runs" />;
  const { hat: rawHat } = await searchParams;
  const hat = rawHat ? normalizeCode(rawHat) : null;
  const now = new Date();
  const runs = await listRuns({ hat: hat ?? undefined, sinceIso: runDateStart("30d", now).toISOString() });
  return <RunsList runs={runs} nowIso={now.toISOString()} hat={hat} />;
}
