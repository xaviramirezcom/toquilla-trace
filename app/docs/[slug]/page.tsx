import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsFrame } from "@/components/docs/DocsFrame";
import { Markdown } from "@/components/docs/Markdown";
import { getRegistry, loadDoc } from "@/lib/docs/load";
import { GITHUB_BLOB } from "@/lib/docs/registry";

// Every page is generated at build time from the repo markdown; unknown slugs are 404.
export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  return (await getRegistry()).map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const entry = (await getRegistry()).find((d) => d.slug === slug);
  // Registry titles ("Overview", "Security") so the page title never repeats the product name.
  return { title: entry ? `${entry.title} · Docs` : "Docs" };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const docs = await getRegistry();
  const entry = docs.find((d) => d.slug === slug);
  if (!entry) notFound();
  const doc = await loadDoc(entry);
  return (
    <DocsFrame docs={docs} active={slug}>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-[13px] text-muted">
        <span className="font-mono">{entry.path}</span>
        <a href={`${GITHUB_BLOB}${entry.path}`} target="_blank" rel="noopener noreferrer" className="hover:text-ink hover:underline">
          View on GitHub
        </a>
      </div>
      {doc.content === null ? (
        <section className="rounded-[18px] border border-dashed border-line bg-surface p-8">
          <h1 className="font-serif text-[30px] font-medium text-ink">{entry.title}</h1>
          <p className="mt-2 text-muted">Coming soon. This document is still being written.</p>
        </section>
      ) : (
        <Markdown source={doc.content} fromPath={entry.path} registry={docs} />
      )}
    </DocsFrame>
  );
}
