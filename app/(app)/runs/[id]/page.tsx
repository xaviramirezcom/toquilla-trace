import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminOnly } from "@/components/admin/AdminOnly";
import { RunDetail } from "@/components/admin/RunDetail";
import { getRun } from "@/lib/admin/queries";
import { isUuid } from "@/lib/admin/runs";
import { getProfile } from "@/lib/auth/role";

export const metadata: Metadata = { title: "Agent run" };
export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getProfile();
  if (profile?.role !== "admin") return <AdminOnly page="Agent runs" />;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const data = await getRun(id);
  if (!data) notFound();
  return <RunDetail run={data.run} proposals={data.proposals} />;
}
