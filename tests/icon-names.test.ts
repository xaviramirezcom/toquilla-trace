import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ICON_FONT_URL, ICON_NAMES } from "@/components/ui/icon-names";

const ROOT = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(e.name) ? [rel] : [];
  });
}

/** Literal icon names in the code: name="x", icon="x", icon: "x", and both sides of <Icon name={a ? "x" : "y"}. */
function iconNamesInCode(): Set<string> {
  const found = new Set<string>();
  const patterns = [
    /\bicon(?:=|:\s*)"([a-z0-9_]+)"/g,
    /<Icon[^>]*\bname="([a-z0-9_]+)"/g,
    /<Icon[^>]*\bname=\{[^}]*\?\s*"([a-z0-9_]+)"\s*:\s*"([a-z0-9_]+)"/g,
    /\bname=\{[^}]*\?\s*"([a-z0-9_]+)"\s*:\s*[^}]*\?\s*"([a-z0-9_]+)"\s*:\s*"([a-z0-9_]+)"/g,
  ];
  for (const file of ["app", "components", "lib"].flatMap(sourceFiles)) {
    const text = readFileSync(join(ROOT, file), "utf8");
    for (const re of patterns) {
      for (const m of text.matchAll(re)) m.slice(1).forEach((n) => n && found.add(n));
    }
  }
  return found;
}

describe("icon font subset", () => {
  it("lists names sorted and unique (Google Fonts rejects unsorted icon_names)", () => {
    expect([...ICON_NAMES]).toEqual([...new Set(ICON_NAMES)].sort());
  });

  it("includes every icon name written literally in the code", () => {
    const listed = new Set<string>(ICON_NAMES);
    const missing = [...iconNamesInCode()].filter((n) => !listed.has(n));
    expect(missing).toEqual([]);
  });

  it("requests only the listed glyphs with display=swap", () => {
    expect(ICON_FONT_URL).toContain(`icon_names=${ICON_NAMES.join(",")}`);
    expect(ICON_FONT_URL).toContain("display=swap");
    expect(ICON_FONT_URL.startsWith("https://fonts.googleapis.com/")).toBe(true);
  });
});
