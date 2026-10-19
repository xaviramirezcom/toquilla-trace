import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetForm } from "@/components/auth/ResetForm";
import { tryGetSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Choose a new password" };
export const dynamic = "force-dynamic";

// Reached from the reset email: /auth/confirm signs the user in, then sends them here.
export default async function ResetPage() {
  const supabase = await tryGetSupabaseServerClient();
  let signedIn = false;
  if (supabase) {
    try {
      const { data } = await supabase.auth.getUser();
      signedIn = data.user !== null;
    } catch {
      signedIn = false;
    }
  }
  if (!signedIn) {
    return (
      <AuthShell title="Link expired" subtitle="Open the newest reset link from your email, or ask for a new one.">
        <Link
          href="/forgot"
          className="inline-flex h-11 w-full items-center justify-center rounded-[10px] border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface2"
        >
          Send a new reset link
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choose a new password" subtitle="You'll stay signed in on this device.">
      <ResetForm />
    </AuthShell>
  );
}
