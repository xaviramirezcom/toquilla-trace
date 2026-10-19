import { describe, expect, it } from "vitest";
import {
  GITHUB_BLOB,
  GITHUB_TREE,
  READING_ORDER,
  buildRegistry,
  createSlugger,
  normalizePath,
  rewriteHref,
  specSlug,
  specTitle,
} from "@/lib/docs/registry";

const reg = buildRegistry(["README.md", "03-workshop-agent.md", "00-conventions.md", "notes.txt"]);

describe("docs registry", () => {
  it("has the fixed slugs and one entry per numbered spec, in order", () => {
    const slugs = reg.map((d) => d.slug);
    for (const s of ["overview", "handoff", "security", "architecture", "ai", "engineering", "specs", "design"]) {
      expect(slugs).toContain(s);
    }
    const i = slugs.indexOf("specs");
    expect(slugs.slice(i, i + 3)).toEqual(["specs", "specs-00-conventions", "specs-03-workshop-agent"]);
    expect(reg.find((d) => d.slug === "overview")?.path).toBe("README.md");
    expect(reg.find((d) => d.slug === "design")?.path).toBe("design_handoff_toquilla_trace/README.md");
  });

  it("names spec slugs and titles from the file name", () => {
    expect(specSlug("09-observability-logs-runs.md")).toBe("specs-09-observability-logs-runs");
    expect(specSlug("README.md")).toBeNull();
    expect(specTitle("03-workshop-agent.md")).toBe("03 Workshop agent");
  });
});

describe("rewriteHref", () => {
  it("keeps external, mailto and in-page links", () => {
    expect(rewriteHref("https://example.com/x", "README.md", reg)).toBe("https://example.com/x");
    expect(rewriteHref("mailto:a@b.co", "README.md", reg)).toBe("mailto:a@b.co");
    expect(rewriteHref("#3-authentication", "docs/SECURITY.md", reg)).toBe("#3-authentication");
  });

  it("sends links between registered docs to /docs/<slug> with the anchor", () => {
    expect(rewriteHref("docs/SECURITY.md", "README.md", reg)).toBe("/docs/security");
    expect(rewriteHref("../README.md#7-decision-log", "docs/SECURITY.md", reg)).toBe("/docs/overview#7-decision-log");
    expect(rewriteHref("specs/03-workshop-agent.md", "docs/SECURITY.md", reg)).toBe("/docs/specs-03-workshop-agent");
    expect(rewriteHref("./00-conventions.md#8-decisions", "docs/specs/README.md", reg)).toBe(
      "/docs/specs-00-conventions#8-decisions",
    );
  });

  it("sends code links to GitHub and keeps line anchors and encoding", () => {
    expect(rewriteHref("../lib/log.ts#L81-L131", "docs/SECURITY.md", reg)).toBe(`${GITHUB_BLOB}lib/log.ts#L81-L131`);
    expect(rewriteHref("../app/%28app%29/layout.tsx#L9", "docs/SECURITY.md", reg)).toBe(
      `${GITHUB_BLOB}app/%28app%29/layout.tsx#L9`,
    );
    expect(rewriteHref("supabase/functions/", "README.md", reg)).toBe(`${GITHUB_TREE}supabase/functions`);
    expect(rewriteHref("../../../etc/passwd", "docs/SECURITY.md", reg)).toBe(GITHUB_TREE);
  });

  it("normalizes paths", () => {
    expect(normalizePath("docs/specs/../SECURITY.md")).toBe("docs/SECURITY.md");
    expect(normalizePath("../x")).toBeNull();
  });
});

describe("createSlugger", () => {
  it("matches GitHub heading ids and numbers repeats", () => {
    const slug = createSlugger();
    expect(slug("11. Known limitations and what we would do next")).toBe(
      "11-known-limitations-and-what-we-would-do-next",
    );
    expect(slug("13. Not implemented yet (planned)")).toBe("13-not-implemented-yet-planned");
    expect(slug("Files")).toBe("files");
    expect(slug("Files")).toBe("files-1");
  });
});

describe("docs index reading order", () => {
  const full = buildRegistry(["00-conventions.md"]);
  it("points only at registered docs, in the order an evaluator should read them", () => {
    const slugs = new Set(full.map((d) => d.slug));
    for (const step of READING_ORDER) for (const s of step.slugs) expect(slugs.has(s)).toBe(true);
    expect(READING_ORDER[0].slugs).toEqual(["overview", "handoff", "security", "architecture", "ai"]);
    expect(READING_ORDER[1].slugs).toEqual(["engineering", "evals", "specs"]);
  });

  it("registers the docs guide and evals, and files specs and design under the planning archive", () => {
    expect(full.find((d) => d.slug === "guide")?.path).toBe("docs/README.md");
    expect(full.find((d) => d.slug === "evals")?.path).toBe("docs/EVALS.md");
    for (const slug of ["specs", "specs-00-conventions", "design"]) {
      expect(full.find((d) => d.slug === slug)?.group).toBe("Planning archive (pre-build)");
    }
  });
});
