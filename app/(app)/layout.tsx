import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { getProfile } from "@/lib/auth/role";
import { tryGetSupabaseServerClient } from "@/lib/supabase/server";
import { countOpenProposals, type ProposalCountClient } from "@/lib/workshop/pending";

// Reads the session cookie on every request, so never prerender.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  // The proxy already redirects with ?next=...; this is the server-side backstop.
  if (!profile) redirect("/login");
  const supabase = await tryGetSupabaseServerClient();
  const pendingCount = await countOpenProposals(supabase as ProposalCountClient | null, profile.workshopId);
  return (
    <AppShell profile={profile} pendingCount={pendingCount}>
      {children}
    </AppShell>
  );
}
