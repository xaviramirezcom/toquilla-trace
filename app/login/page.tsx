import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { ReviewerNote } from "@/components/auth/ReviewerNote";
import { loginNotice } from "@/components/auth/rules";
import { safeNext } from "@/lib/safe-next";
import { tryGetSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Log in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : null;
  const notice = loginNotice(typeof sp.notice === "string" ? sp.notice : null);
  // Signed-in users skip the form (spec 01 rule 14).
  const supabase = await tryGetSupabaseServerClient();
  if (supabase) {
    let signedIn = false;
    try {
      const { data } = await supabase.auth.getUser();
      signedIn = data.user !== null;
    } catch {
      signedIn = false;
    }
    if (signedIn) redirect(safeNext(next));
  }
  return (
    <AuthShell title="Welcome back" subtitle="Log in to your workshop.">
      <ReviewerNote />
      <LoginForm next={next} notice={notice} />
    </AuthShell>
  );
}
