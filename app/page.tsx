import Link from "next/link";
import { Logo } from "@/components/shell/Logo";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-4 py-10">
      <Logo href="/" />
      <h1 className="font-serif text-[44px] leading-[1.04] font-medium tracking-[-0.025em] md:text-[80px]">
        Every hat has a story. <em className="text-accent">Just tell it.</em>
      </h1>
      <p className="text-muted">Coming soon.</p>
      <div className="flex gap-3">
        <Link href="/login" className="font-semibold text-accent underline-offset-4 hover:underline">
          Log in
        </Link>
        <Link href="/signup" className="font-semibold text-accent underline-offset-4 hover:underline">
          Sign up
        </Link>
      </div>
    </main>
  );
}
