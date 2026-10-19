// Server component: repo markdown to React. Raw HTML in the markdown is not rendered
// (react-markdown default), links are rewritten (lib/docs/registry.ts), ```mermaid blocks become
// diagrams and headings get GitHub-style ids so existing #anchors keep working.
import Link from "next/link";
import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { createSlugger, rewriteHref, type DocEntry } from "@/lib/docs/registry";
import { Mermaid } from "./Mermaid";

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
}

function hastText(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(hastText).join("");
}

function nodeText(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(nodeText).join("");
  if (children && typeof children === "object" && "props" in children) {
    return nodeText((children as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

function Heading({
  tag: Tag,
  slug,
  children,
}: {
  tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  slug: (text: string) => string;
  children?: ReactNode;
}) {
  const id = slug(nodeText(children));
  return (
    <Tag id={id} className="doc-heading">
      <a href={`#${id}`} className="doc-anchor" aria-hidden tabIndex={-1}>
        #
      </a>
      {children}
    </Tag>
  );
}

export function Markdown({ source, fromPath, registry }: { source: string; fromPath: string; registry: DocEntry[] }) {
  const slug = createSlugger();
  const components: Components = {
    h1: ({ children }) => <Heading tag="h1" slug={slug}>{children}</Heading>,
    h2: ({ children }) => <Heading tag="h2" slug={slug}>{children}</Heading>,
    h3: ({ children }) => <Heading tag="h3" slug={slug}>{children}</Heading>,
    h4: ({ children }) => <Heading tag="h4" slug={slug}>{children}</Heading>,
    h5: ({ children }) => <Heading tag="h5" slug={slug}>{children}</Heading>,
    h6: ({ children }) => <Heading tag="h6" slug={slug}>{children}</Heading>,
    a: ({ href, children }) => {
      const to = rewriteHref(href ?? "", fromPath, registry);
      if (to.startsWith("/docs/")) return <Link href={to}>{children}</Link>;
      const external = /^https?:/.test(to);
      return (
        <a href={to} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
          {children}
        </a>
      );
    },
    // Images are not hot-linked (CSP img-src is self only): show a link to the file instead.
    img: ({ src, alt }) => {
      const to = rewriteHref(typeof src === "string" ? src : "", fromPath, registry);
      return (
        <a href={to} target="_blank" rel="noopener noreferrer" className="doc-image-link">
          Image: {alt || "open on GitHub"}
        </a>
      );
    },
    pre: ({ node, children }) => {
      const code = (node as HastNode | undefined)?.children?.find((c) => c.tagName === "code");
      const cls = code?.properties?.className;
      const classes = Array.isArray(cls) ? cls.map(String) : [];
      if (classes.includes("language-mermaid")) return <Mermaid chart={hastText(code).trim()} />;
      return <pre className="doc-pre">{children}</pre>;
    },
    table: ({ children }) => (
      <div className="doc-table-wrap">
        <table>{children}</table>
      </div>
    ),
  };

  return (
    <div className="doc-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
