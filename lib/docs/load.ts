import "server-only";
// Reads the repo markdown for /docs. Runs at build time (the pages are static), and
// next.config.ts traces the same files into the server bundle in case a page renders at runtime.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { buildRegistry, type DocEntry } from "./registry";

const ROOT = process.cwd();

export async function getRegistry(): Promise<DocEntry[]> {
  let files: string[] = [];
  try {
    files = await readdir(path.join(/*turbopackIgnore: true*/ ROOT, "docs/specs"));
  } catch {
    files = [];
  }
  return buildRegistry(files);
}

export interface LoadedDoc {
  entry: DocEntry;
  /** null when the file is missing or empty ("Coming soon"). */
  content: string | null;
  title: string;
}

function firstHeading(md: string): string | null {
  const m = /^#\s+(.+?)\s*#*\s*$/m.exec(md);
  return m ? m[1].replace(/[*_`]/g, "").trim() : null;
}

export async function loadDoc(entry: DocEntry): Promise<LoadedDoc> {
  try {
    const content = await readFile(path.join(/*turbopackIgnore: true*/ ROOT, entry.path), "utf8");
    if (content.trim() === "") return { entry, content: null, title: entry.title };
    return { entry, content, title: firstHeading(content) ?? entry.title };
  } catch {
    return { entry, content: null, title: entry.title };
  }
}
