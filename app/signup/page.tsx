import type { Metadata } from "next";
import { Logo } from "@/components/shell/Logo";
import { Card } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <Logo href="/" />
      <Card padding="lg">
        <h1 className="font-serif text-[28px] font-medium">Create your workshop account</h1>
        <p className="mt-2 text-muted">Coming soon.</p>
      </Card>
    </main>
  );
}
