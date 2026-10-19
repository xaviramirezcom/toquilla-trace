"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { GRADES, STAGES } from "@domain/domain";
import { Badge, Button, Card, EmptyState, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  EMPTY_FILTERS,
  filterHats,
  hasActiveFilters,
  hatCountLabel,
  longDate,
  openFlags,
  ownerLabel,
  relativeTime,
  type HatFilters,
} from "@/lib/hats/format";
import type { HatListRow } from "@/lib/hats/types";
import { CopyButton } from "./CopyButton";
import { GradeBadge } from "./GradeBadge";
import { MiniStepper } from "./MiniStepper";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        // 44px tall on touch screens (handoff minimum target), compact 32px on desktop.
        "inline-flex h-11 items-center gap-1 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap md:h-8",
        "focus-visible:outline-2 focus-visible:outline-accent",
        active ? "border-accent bg-accent-tint text-accent" : "border-line bg-surface text-ink hover:bg-surface2",
      )}
    >
      {active && <Icon name="check" size={14} />}
      {children}
    </button>
  );
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function HatsList({ rows, nowIso, initialFlagged }: { rows: HatListRow[]; nowIso: string; initialFlagged: boolean }) {
  const router = useRouter();
  const [filters, setFilters] = useState<HatFilters>({ ...EMPTY_FILTERS, flagged: initialFlagged });
  const [query, setQuery] = useState("");

  // 200 ms debounce on the search box (spec 08 section 4.1).
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, q: query })), 200);
    return () => clearTimeout(t);
  }, [query]);

  const shown = useMemo(() => filterHats(rows, filters), [rows, filters]);
  const filtered = hasActiveFilters(filters);

  function clearFilters() {
    setQuery("");
    setFilters(EMPTY_FILTERS);
  }

  if (rows.length === 0) {
    return (
      <section>
        <Header count={hatCountLabel(0, 0, false)} />
        <Card className="mt-6">
          <EmptyState
            icon="styler"
            title="No hats yet."
            description="Tell the assistant about a hat in the Workshop and approve its proposal."
            action={
              <Button icon="add" onClick={() => router.push("/workshop")}>
                Add your first hat
              </Button>
            }
          />
        </Card>
        <MobileMic />
      </section>
    );
  }

  return (
    <section>
      <Header count={hatCountLabel(shown.length, rows.length, filtered)} />

      <div className="mt-5 flex flex-col gap-3">
        <label className="relative block max-w-md">
          <span className="sr-only">Search by code or weaver</span>
          <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by code or weaver"
            className="h-11 w-full rounded-[10px] border border-line bg-surface pr-10 pl-10 text-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute top-0 right-0 grid h-11 w-11 place-items-center rounded-[10px] text-muted hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Icon name="close" size={18} />
            </button>
          )}
        </label>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Filters">
          <Chip active={filters.flagged} onClick={() => setFilters((f) => ({ ...f, flagged: !f.flagged }))}>
            <Icon name="flag" size={14} /> Flagged only
          </Chip>
          <span className="mx-1 w-px shrink-0 bg-line" aria-hidden />
          {STAGES.map((s, i) => (
            <Chip key={s} active={filters.stages.includes(i)} onClick={() => setFilters((f) => ({ ...f, stages: toggle(f.stages, i) }))}>
              {s}
            </Chip>
          ))}
          <span className="mx-1 w-px shrink-0 bg-line" aria-hidden />
          {GRADES.map((g) => (
            <Chip key={g} active={filters.grades.includes(g)} onClick={() => setFilters((f) => ({ ...f, grades: toggle(f.grades, g) }))}>
              {g}
            </Chip>
          ))}
          {filtered && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <Card className="mt-5">
          <EmptyState
            icon="filter_alt_off"
            title="No hats match these filters."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card padding="none" className="mt-5 hidden overflow-hidden md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface2 text-xs font-semibold text-muted">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-3 py-3">Grade</th>
                  <th className="px-3 py-3 text-right">Rows/in</th>
                  <th className="px-3 py-3">Weaver</th>
                  <th className="px-3 py-3">Stage</th>
                  <th className="px-3 py-3">Owner</th>
                  <th className="px-3 py-3">Flags</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((h) => {
                  const open = openFlags(h.flags).length;
                  const href = `/hats/${h.code}`;
                  return (
                    <tr
                      key={h.code}
                      onClick={() => router.push(href)}
                      className="cursor-pointer border-t border-line hover:bg-surface2/60"
                    >
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1">
                          <Link href={href} className="font-mono font-semibold text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
                            {h.code}
                          </Link>
                          <CopyButton text={h.code} toastMessage="Code copied." label={`Copy ${h.code}`} />
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <GradeBadge grade={h.grade} />
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">{h.rows_per_inch}</td>
                      <td className="px-3 py-2.5">
                        <div className="text-ink">{h.weaver?.name ?? "Unknown weaver"}</div>
                        {h.weaver?.village && <div className="text-xs text-muted">{h.weaver.village}</div>}
                      </td>
                      <td className="px-3 py-2.5">
                        <MiniStepper stage={h.stage} />
                      </td>
                      <td className="px-3 py-2.5 text-ink">{ownerLabel(h.owner_type)}</td>
                      <td className="px-3 py-2.5">
                        {open > 0 ? (
                          <Badge tone="warn" icon="flag" pill>
                            {open}
                          </Badge>
                        ) : (
                          <span className="text-muted" aria-label="No open flags">
                            ·
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted" title={longDate(h.updated_at)}>
                        {relativeTime(h.updated_at, nowIso)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <ul className="mt-5 flex flex-col gap-3 md:hidden">
            {shown.map((h) => {
              const flags = openFlags(h.flags);
              return (
                <li key={h.code}>
                  <Link href={`/hats/${h.code}`} className="block">
                    <Card className="hover:bg-surface2/60">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[15px] font-semibold text-ink">{h.code}</span>
                        <GradeBadge grade={h.grade} />
                        <CopyButton text={h.code} toastMessage="Code copied." label={`Copy ${h.code}`} className="ml-auto" />
                      </div>
                      <p className="mt-1 text-[13px] text-muted">
                        {[h.weaver?.name ?? "Unknown weaver", h.weaver?.village, `${h.rows_per_inch} rows/in`].filter(Boolean).join(" · ")}
                      </p>
                      <MiniStepper stage={h.stage} className="mt-3" />
                      {flags.length > 0 && (
                        <p className="mt-2 flex items-start gap-1.5 text-[13px] text-warn">
                          <Icon name="flag" size={16} className="mt-px" />
                          {flags[0].message}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-muted">
                        {ownerLabel(h.owner_type)} · <span title={longDate(h.updated_at)}>{relativeTime(h.updated_at, nowIso)}</span>
                      </p>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <MobileMic />
    </section>
  );
}

function Header({ count }: { count: string }) {
  const router = useRouter();
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.015em] text-ink">Hats</h1>
        <p className="text-[13px] text-muted">{count}</p>
      </div>
      <div className="hidden md:block">
        <Button variant="secondary" icon="mic" onClick={() => router.push("/workshop")}>
          Just tell it
        </Button>
      </div>
    </div>
  );
}

/** 64px floating mic on mobile, opens the Workshop composer already recording. */
function MobileMic() {
  return (
    <Link
      href="/workshop?record=1"
      aria-label="Record a note"
      className="fixed right-4 bottom-24 z-30 grid h-16 w-16 place-items-center rounded-full bg-accent text-on-accent shadow-card md:hidden"
    >
      <Icon name="mic" size={28} filled />
    </Link>
  );
}
