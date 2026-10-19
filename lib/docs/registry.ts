// Which repo markdown files the public /docs pages show, and how links inside them are rewritten.
// Pure (no fs), so it is unit tested; lib/docs/load.ts reads the files.

export const GITHUB_REPO = "https://github.com/xaviramirezcom/toquilla-trace";
export const GITHUB_BLOB = "https://github.com/xaviramirezcom/toquilla-trace/blob/main/";
export const GITHUB_TREE = "https://github.com/xaviramirezcom/toquilla-trace/tree/main/";

export type DocGroup = "Start here" | "Engineering" | "Specs" | "Design";

export interface DocEntry {
  slug: string;
  /** Repo-relative path, forward slashes. */
  path: string;
  title: string;
  group: DocGroup;
}

const FIXED: DocEntry[] = [
  { slug: "overview", path: "README.md", title: "Overview", group: "Start here" },
  { slug: "handoff", path: "HANDOFF.md", title: "Handoff note", group: "Start here" },
  { slug: "architecture", path: "docs/ARCHITECTURE.md", title: "Architecture", group: "Engineering" },
  { slug: "ai", path: "docs/AI.md", title: "AI design", group: "Engineering" },
  { slug: "security", path: "docs/SECURITY.md", title: "Security", group: "Engineering" },
  { slug: "engineering", path: "docs/ENGINEERING.md", title: "Engineering practices", group: "Engineering" },
  { slug: "evals", path: "docs/EVALS.md", title: "Eval results", group: "Engineering" },
  { slug: "specs", path: "docs/specs/README.md", title: "Specs index", group: "Specs" },
  { slug: "design", path: "design_handoff_toquilla_trace/README.md", title: "Design handoff", group: "Design" },
];

const SPEC_FILE_RE = /^(\d{2})-([a-z0-9-]+)\.md$/;

/** "03-workshop-agent.md" -> "specs-03-workshop-agent"; anything else -> null. */
export function specSlug(filename: string): string | null {
  const m = SPEC_FILE_RE.exec(filename);
  return m ? `specs-${m[1]}-${m[2]}` : null;
}

/** "03-workshop-agent.md" -> "03 Workshop agent". */
export function specTitle(filename: string): string {
  const m = SPEC_FILE_RE.exec(filename);
  if (!m) return filename;
  const words = m[2].replace(/-/g, " ");
  return `${m[1]} ${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

/** Full registry: fixed docs plus every docs/specs/NN-*.md file name given (sorted). */
export function buildRegistry(specFiles: readonly string[]): DocEntry[] {
  const specs = [...specFiles]
    .filter((f) => specSlug(f) !== null)
    .sort()
    .map((f): DocEntry => ({ slug: specSlug(f) as string, path: `docs/specs/${f}`, title: specTitle(f), group: "Specs" }));
  const out = [...FIXED];
  const at = out.findIndex((d) => d.slug === "specs") + 1;
  out.splice(at, 0, ...specs);
  return out;
}

/** Normalizes "a/b/../c/./d" to "a/c/d". Returns null when it climbs above the repo root. */
export function normalizePath(path: string): string | null {
  const parts: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/");
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Rewrites a markdown link found in the doc at `fromPath`:
 * - external (http, https, mailto) and in-page (#...) links are kept,
 * - a link to another registered doc goes to /docs/<slug> (anchor kept),
 * - any other repo path goes to GitHub (blob for files, tree for folders; #Lnn anchors kept).
 */
export function rewriteHref(href: string, fromPath: string, registry: readonly DocEntry[]): string {
  const h = href.trim();
  if (h === "" || h.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(h) || h.startsWith("//")) return h;
  const hashAt = h.indexOf("#");
  const rawPath = hashAt >= 0 ? h.slice(0, hashAt) : h;
  const anchor = hashAt >= 0 ? h.slice(hashAt) : "";
  const pathOnly = rawPath.split("?")[0];
  const baseDir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/") + 1) : "";
  const joined = pathOnly.startsWith("/") ? pathOnly.slice(1) : baseDir + pathOnly;
  const isDir = pathOnly.endsWith("/");
  const resolved = normalizePath(safeDecode(joined));
  if (resolved === null) return GITHUB_TREE;
  const doc = registry.find((d) => d.path === resolved);
  if (doc) return `/docs/${doc.slug}${anchor}`;
  const encoded = resolved
    .split("/")
    .map((seg) => encodeURIComponent(seg).replace(/[()!'*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
  return `${isDir || resolved === "" ? GITHUB_TREE : GITHUB_BLOB}${encoded}${anchor}`;
}

/** GitHub-style heading id: lower case, punctuation dropped, spaces to "-", repeats numbered. */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s/g, "-");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };
}
