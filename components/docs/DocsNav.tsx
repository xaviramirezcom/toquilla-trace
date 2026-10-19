"use client";
// Mobile document picker (the desktop sidebar is plain links in DocsFrame).
import { useRouter } from "next/navigation";
import type { DocEntry } from "@/lib/docs/registry";

export function DocsSelect({ docs, active }: { docs: DocEntry[]; active: string | null }) {
  const router = useRouter();
  const groups = [...new Set(docs.map((d) => d.group))];
  return (
    <label className="block md:hidden">
      <span className="sr-only">Choose a document</span>
      <select
        className="h-11 w-full rounded-[10px] border border-line bg-surface px-3 text-[15px] text-ink"
        value={active ?? ""}
        onChange={(e) => router.push(e.target.value ? `/docs/${e.target.value}` : "/docs")}
      >
        <option value="">All docs</option>
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {docs
              .filter((d) => d.group === g)
              .map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.title}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
