import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { getProfile } from "@/lib/auth/role";

// Reads the session cookie on every request, so never prerender.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  // The proxy already redirects with ?next=...; this is the server-side backstop.
  if (!profile) redirect("/login");
  return <AppShell profile={profile}>{children}</AppShell>;
}
