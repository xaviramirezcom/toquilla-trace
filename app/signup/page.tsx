import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { ReviewerNote } from "@/components/auth/ReviewerNote";
import { SignupForm } from "@/components/auth/SignupForm";
import { tryGetSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sign up" };
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const supabase = await tryGetSupabaseServerClient();
  if (supabase) {
    let signedIn = false;
    try {
      const { data } = await supabase.auth.getUser();
      signedIn = data.user !== null;
    } catch {
      signedIn = false;
    }
    if (signedIn) redirect("/workshop");
  }
  return (
    <AuthShell title="Create your workshop account" subtitle="One account for your workshop. You approve every change.">
      <ReviewerNote />
      <SignupForm />
    </AuthShell>
  );
}
