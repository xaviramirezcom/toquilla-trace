import type { Metadata } from "next";
import { AdminOnly } from "@/components/admin/AdminOnly";
import { LogsView } from "@/components/admin/LogsView";
import { parseLogFilters } from "@/lib/admin/logs";
import { getProfile } from "@/lib/auth/role";

export const metadata: Metadata = { title: "Logs" };
export const dynamic = "force-dynamic";

export default async function LogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await getProfile();
  // UX guard only. RLS (is_admin()) returns zero app_logs rows to members.
  if (profile?.role !== "admin") return <AdminOnly page="Logs" />;
  const params = await searchParams;
  const id = Number(Array.isArray(params.id) ? params.id[0] : params.id);
  return <LogsView initialFilters={parseLogFilters(params)} initialId={Number.isInteger(id) && id > 0 ? id : null} />;
}
