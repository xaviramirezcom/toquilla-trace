import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/shell/Logo";

/** Centered 420px auth card (desktop); single column with a bottom action bar on mobile. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <div className="woven h-[14px] w-full" aria-hidden />
      <main className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-4 pt-8 pb-32 md:justify-center md:pt-16 md:pb-16">
        <Logo href="/" />
        <section className="rounded-[18px] border border-line bg-surface p-5 md:p-7 md:shadow-card">
          <h1 className="font-serif text-[30px] leading-tight font-medium tracking-[-0.015em] text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </section>
        <footer className="flex flex-wrap items-center justify-center gap-4 text-[13px] text-muted">
          <Link href="/docs" className="hover:text-ink hover:underline">
            Docs
          </Link>
          <Link href="/" className="hover:text-ink hover:underline">
            Home
          </Link>
        </footer>
      </main>
    </div>
  );
}
