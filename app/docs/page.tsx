import type { Metadata } from "next";
import Link from "next/link";
import { DocsFrame } from "@/components/docs/DocsFrame";
import { getRegistry, loadDoc } from "@/lib/docs/load";
import { READING_ORDER } from "@/lib/docs/registry";

export const metadata: Metadata = {
  title: "Docs",
  description: "How Toquilla Trace is built: architecture, AI design, security, specs and the design handoff.",
};

// Built once from the repo markdown (no request data).
export const dynamic = "force-static";

export default async function DocsIndex() {
  const docs = await getRegistry();
  const loaded = await Promise.all(docs.map(loadDoc));
  const groups = [...new Set(docs.map((d) => d.group))];
  const titleOf = (slug: string) => docs.find((d) => d.slug === slug)?.title ?? slug;
  return (
    <DocsFrame docs={docs} active={null}>
      <h1 className="font-serif text-[36px] leading-tight font-medium tracking-[-0.015em] text-ink">Docs</h1>
      <p className="mt-2 max-w-[640px] text-[16px] text-muted">
        The same markdown that lives in the repository, rendered here. Links to code open on GitHub.
      </p>
      <section aria-labelledby="reading-order" className="mt-6 rounded-[14px] border border-line bg-surface p-4 md:p-5">
        <h2 id="reading-order" className="font-semibold text-ink">
          Reading order
        </h2>
        {READING_ORDER.map((step, n) => {
          // Numbers continue across steps: the 45-minute list starts where the 10-minute one ends.
          const offset = READING_ORDER.slice(0, n).reduce((sum, s) => sum + s.slugs.length, 0);
          return (
            <div key={step.label} className="mt-3">
              <p className="text-[13px] font-semibold text-muted">{step.label}</p>
              <ol className="mt-1.5 flex flex-wrap gap-2">
                {step.slugs.map((slug, i) => (
                  <li key={slug}>
                    <Link
                      href={`/docs/${slug}`}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-bg px-3.5 text-[14px] font-medium text-ink hover:border-accent"
                    >
                      <span className="font-mono text-[12px] text-muted">{offset + i + 1}</span>
                      {titleOf(slug)}
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </section>
      {groups.map((g) => (
        <section key={g} className="mt-8">
          <h2 className="mb-3 text-[12px] font-bold tracking-[0.04em] text-muted uppercase">{g}</h2>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {loaded
              .filter((d) => d.entry.group === g)
              .map((d) => (
                <li key={d.entry.slug}>
                  <Link
                    href={`/docs/${d.entry.slug}`}
                    className="flex h-full flex-col gap-1 rounded-[14px] border border-line bg-surface p-4 hover:border-accent"
                  >
                    <span className="font-semibold text-ink">{d.entry.title}</span>
                    <span className="font-mono text-[12px] text-muted">{d.entry.path}</span>
                    {d.content === null && <span className="text-[13px] text-warn">Coming soon</span>}
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </DocsFrame>
  );
}
