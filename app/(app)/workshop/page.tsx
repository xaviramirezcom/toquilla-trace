import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isValidCode } from "@domain/domain";
import { WorkshopDashboard } from "@/components/workshop/WorkshopDashboard";
import { getProfile } from "@/lib/auth/role";
import { loadWorkshopOverview } from "@/lib/workshop/overview";

export const metadata: Metadata = { title: "Workshop" };
export const dynamic = "force-dynamic";

export default async function WorkshopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [profile, sp] = await Promise.all([getProfile(), searchParams]);
  if (!profile) redirect("/login?next=%2Fworkshop");
  const overview = await loadWorkshopOverview(profile);
  const hat = typeof sp.hat === "string" && isValidCode(sp.hat) ? sp.hat : null;
  return (
    <WorkshopDashboard
      profile={profile}
      overview={overview}
      welcome={sp.welcome === "1"}
      hatTag={hat}
      autoRecord={sp.record === "1"}
    />
  );
}
