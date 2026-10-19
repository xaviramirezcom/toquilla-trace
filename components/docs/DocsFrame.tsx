import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/shell/Logo";
import { cn } from "@/lib/cn";
import { GITHUB_REPO, type DocEntry } from "@/lib/docs/registry";
import { DocsSelect } from "./DocsNav";

/** Public docs chrome: top bar, sidebar of docs on desktop, a select on mobile. */
export function DocsFrame({ docs, active, children }: { docs: DocEntry[]; active: string | null; children: ReactNode }) {
  const groups = [...new Set(docs.map((d) => d.group))];
  return (
    <div className="min-h-dvh bg-bg">
      <div className="woven h-[10px] w-full" aria-hidden />
      <header className="flex items-center gap-4 border-b border-line px-4 py-3 md:px-8">
        <Logo href="/" />
        <Link href="/docs" className="ml-1 text-[15px] font-semibold text-muted hover:text-ink">
          Docs
        </Link>
        <a
          href={GITHUB_REPO}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-[14px] text-muted hover:text-ink hover:underline"
        >
          GitHub
        </a>
      </header>
      <div className="mx-auto flex w-full max-w-[1200px] gap-10 px-4 py-6 md:px-8 md:py-10">
        <nav aria-label="Documents" className="hidden w-[230px] shrink-0 md:block">
          <div className="sticky top-6 max-h-[calc(100dvh-48px)] overflow-y-auto pr-2">
            {groups.map((g) => (
              <div key={g} className="mb-5">
                <p className="mb-1.5 text-[11px] font-bold tracking-[0.04em] text-muted uppercase">{g}</p>
                <ul className="flex flex-col gap-0.5">
                  {docs
                    .filter((d) => d.group === g)
                    .map((d) => (
                      <li key={d.slug}>
                        <Link
                          href={`/docs/${d.slug}`}
                          aria-current={d.slug === active ? "page" : undefined}
                          className={cn(
                            "block rounded-[8px] px-2.5 py-1.5 text-[14px]",
                            d.slug === active ? "bg-accent-tint font-semibold text-accent" : "text-ink hover:bg-surface2",
                          )}
                        >
                          {d.title}
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>
        <main className="min-w-0 flex-1">
          <div className="mb-6 md:hidden">
            <DocsSelect docs={docs} active={active} />
          </div>
          {children}
        </main>
      </div>
      <footer className="flex flex-wrap items-center gap-4 border-t border-line px-4 py-5 text-sm text-muted md:px-8">
        <span className="mr-auto">Made in Cuenca, Ecuador</span>
        <Link href="/" className="hover:text-ink hover:underline">
          Home
        </Link>
        <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer" className="hover:text-ink hover:underline">
          GitHub
        </a>
      </footer>
    </div>
  );
}
