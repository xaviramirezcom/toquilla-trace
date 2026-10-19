import type { Metadata } from "next";
import { WeaversView } from "@/components/weavers/WeaversView";
import { getProfile } from "@/lib/auth/role";
import { listWeavers } from "@/lib/hats/queries";

export const metadata: Metadata = { title: "Weavers" };
export const dynamic = "force-dynamic";

export default async function WeaversPage() {
  const [profile, weavers] = await Promise.all([getProfile(), listWeavers()]);
  // Admins read every workshop but write none (D7), so they get no Add or Edit buttons.
  const canEdit = profile?.role === "member" && Boolean(profile.workshopId);
  return <WeaversView weavers={weavers} canEdit={canEdit} />;
}
