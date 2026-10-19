"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LOG_ACTIONS, buildDebugPrompt, type DebugPromptRow, type LogLevel, type LogSource } from "@domain/log-format";
import { Badge, Button, Card, EmptyState, Icon, Skeleton, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { tryGetSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  EMPTY_LOG_FILTERS,
  LEVELS,
  SOURCES,
  SOURCE_LABELS,
  TIME_RANGES,
  hasLogFilters,
  logFiltersToQuery,
  logTime,
  logTimestamp,
  searchFilter,
  shortId,
  sinceIso,
  type LogFilters,
  type LogRowFull,
  type TimeRange,
} from "@/lib/admin/logs";
import { JsonView } from "./JsonView";

const COLS = "id,created_at,level,source,action,message,user_id,request_id,hat_code,run_id,duration_ms,payload,error";
const PAGE = 100;

const LEVEL_META: Record<LogLevel, { tone: "err" | "warn" | "info" | "neutral"; icon: string; label: string }> = {
  error: { tone: "err", icon: "error", label: "Error" },
  warn: { tone: "warn", icon: "warning", label: "Warn" },
  info: { tone: "info", icon: "info", label: "Info" },
  debug: { tone: "neutral", icon: "bug_report", label: "Debug" },
};

export function LevelPill({ level }: { level: LogLevel }) {
  const m = LEVEL_META[level] ?? LEVEL_META.info;
  return (
    <Badge tone={m.tone} icon={m.icon} pill>
      {m.label}
    </Badge>
  );
}

type LoadState = "loading" | "ready" | "error";

export function LogsView({ initialFilters, initialId }: { initialFilters: LogFilters; initialId: number | null }) {
  const toast = useToast();
  const [filters, setFilters] = useState<LogFilters>(initialFilters);
  const [searchText, setSearchText] = useState(initialFilters.q);
  const [actionText, setActionText] = useState(initialFilters.action);
  const [rows, setRows] = useState<LogRowFull[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(initialId);
  const [extraRow, setExtraRow] = useState<LogRowFull | null>(null);
  const [counts, setCounts] = useState<Record<"error" | "warn" | "info", number | null>>({ error: null, warn: null, info: null });
  const [reloadKey, setReloadKey] = useState(0);

  // Keep the URL in sync so links work (spec 09 section 4.1).
  useEffect(() => {
    const url = `/logs${logFiltersToQuery(filters, selectedId)}`;
    window.history.replaceState(null, "", url);
  }, [filters, selectedId]);

  // Debounced text inputs.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === searchText ? f : { ...f, q: searchText })), 300);
    return () => clearTimeout(t);
  }, [searchText]);
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.action === actionText ? f : { ...f, action: actionText })), 300);
    return () => clearTimeout(t);
  }, [actionText]);

  const fetchPage = useCallback(async (f: LogFilters, beforeId?: number): Promise<LogRowFull[]> => {
    const sb = tryGetSupabaseBrowserClient();
    if (!sb) throw new Error("not configured");
    let q = sb.from("app_logs").select(COLS).order("id", { ascending: false }).limit(PAGE);
    // A request id shows the whole story of one action, whatever its age.
    if (!f.req) q = q.gte("created_at", sinceIso(f.since, new Date()));
    if (f.levels.length) q = q.in("level", f.levels);
    if (f.sources.length) q = q.in("source", f.sources);
    if (f.action) q = f.action.endsWith(".") ? q.like("action", `${f.action}%`) : q.eq("action", f.action);
    if (f.req) q = q.eq("request_id", f.req);
    if (f.hat) q = q.eq("hat_code", f.hat);
    if (f.run) q = q.eq("run_id", f.run);
    const s = searchFilter(f.q);
    if (s?.kind === "request") q = q.eq("request_id", s.value);
    if (s?.kind === "text") q = q.or(s.or);
    if (beforeId) q = q.lt("id", beforeId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as LogRowFull[];
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Loading state is set in the event handlers that change filters; this effect only fetches.
    fetchPage(filters)
      .then((data) => {
        if (cancelled) return;
        setRows(data);
        setHasMore(data.length === PAGE);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [filters, fetchPage, reloadKey]);

  // Level chip counts for the current time range (Nice).
  useEffect(() => {
    const sb = tryGetSupabaseBrowserClient();
    if (!sb) return;
    let cancelled = false;
    const since = sinceIso(filters.since, new Date());
    Promise.all(
      (["error", "warn", "info"] as const).map(async (level) => {
        const { count } = await sb.from("app_logs").select("id", { count: "exact", head: true }).eq("level", level).gte("created_at", since);
        return [level, count ?? 0] as const;
      }),
    )
      .then((pairs) => {
        if (!cancelled) setCounts(Object.fromEntries(pairs) as Record<"error" | "warn" | "info", number>);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [filters.since, reloadKey]);

  // An ?id= row outside the current page (for example from a hat's Logs tab) is loaded on its own.
  useEffect(() => {
    if (!selectedId || state !== "ready" || rows.some((r) => r.id === selectedId) || extraRow?.id === selectedId) return;
    const sb = tryGetSupabaseBrowserClient();
    if (!sb) return;
    let cancelled = false;
    sb.from("app_logs")
      .select(COLS)
      .eq("id", selectedId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setExtraRow(data as LogRowFull);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, rows, state, extraRow]);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? (extraRow?.id === selectedId ? extraRow : null),
    [rows, selectedId, extraRow],
  );

  function update(next: Partial<LogFilters>) {
    setState("loading");
    setFilters((f) => ({ ...f, ...next }));
  }

  function clearAll() {
    setSearchText("");
    setActionText("");
    setState("loading");
    setFilters(EMPTY_LOG_FILTERS);
  }

  async function loadOlder() {
    const last = rows[rows.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const more = await fetchPage(filters, last.id);
      setRows((r) => [...r, ...more]);
      setHasMore(more.length === PAGE);
    } catch {
      toast.error("Couldn't load older rows.");
    } finally {
      setLoadingMore(false);
    }
  }

  // Esc closes the panel; arrow keys step through rows.
  useEffect(() => {
    if (!selectedId) return;
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) return;
      if (e.key === "Escape") setSelectedId(null);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const i = rows.findIndex((r) => r.id === selectedId);
        const next = rows[i + (e.key === "ArrowDown" ? 1 : -1)];
        if (i >= 0 && next) {
          e.preventDefault();
          setSelectedId(next.id);
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedId, rows]);

  const filtered = hasLogFilters(filters);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.015em] text-ink">Logs</h1>
          <p className="text-[13px] text-muted">Every user action and server step, newest first.</p>
        </div>
        <Button variant="secondary" size="sm" icon="refresh" onClick={() => {
          setState("loading");
          setReloadKey((k) => k + 1);
        }}>
          Refresh
        </Button>
      </div>

      {/* Toolbar */}
      <div className="mt-5 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <label className="relative min-w-[240px] flex-1 md:max-w-sm">
            <span className="sr-only">Search messages, actions or IDs</span>
            <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
              }}
              placeholder="Search messages, actions or IDs"
              className="h-10 w-full rounded-[10px] border border-line bg-surface pr-3 pl-10 text-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
          <label className="relative min-w-[200px]">
            <span className="sr-only">Action</span>
            <input
              list="log-actions"
              value={actionText}
              onChange={(e) => setActionText(e.target.value)}
              placeholder="Action, e.g. agent."
              className="h-10 w-full rounded-[10px] border border-line bg-surface px-3 font-mono text-[13px] text-ink placeholder:font-sans placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
            />
            <datalist id="log-actions">
              {LOG_ACTIONS.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </label>
          <select
            aria-label="Time range"
            value={filters.since}
            onChange={(e) => update({ since: e.target.value as TimeRange })}
            className="h-10 rounded-[10px] border border-line bg-surface px-3 text-sm text-ink"
          >
            {(Object.keys(TIME_RANGES) as TimeRange[]).map((r) => (
              <option key={r} value={r}>
                Last {TIME_RANGES[r]}
              </option>
            ))}
          </select>
          {filtered && (
            <Button variant="ghost" size="sm" className="h-10" onClick={clearAll}>
              Clear filters
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Level and source filters">
          {LEVELS.map((l) => (
            <FilterChip
              key={l}
              active={filters.levels.includes(l)}
              onClick={() => update({ levels: toggle(filters.levels, l) })}
              count={l === "debug" ? null : counts[l]}
            >
              {LEVEL_META[l].label === "Warn" ? "Warnings" : LEVEL_META[l].label === "Error" ? "Errors" : LEVEL_META[l].label}
            </FilterChip>
          ))}
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          {SOURCES.map((s) => (
            <FilterChip key={s} active={filters.sources.includes(s)} onClick={() => update({ sources: toggle(filters.sources, s) })}>
              {SOURCE_LABELS[s]}
            </FilterChip>
          ))}
        </div>
        {(filters.req || filters.hat || filters.run) && (
          <div className="flex flex-wrap gap-2">
            {filters.req && <ActiveTag label={`Request ${filters.req}`} onClear={() => update({ req: "" })} />}
            {filters.hat && <ActiveTag label={`Hat ${filters.hat}`} onClear={() => update({ hat: "" })} />}
            {filters.run && <ActiveTag label={`Run ${shortId(filters.run, 8)}`} onClear={() => update({ run: "" })} />}
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-4">
        <div className="min-w-0 flex-1">
          {state === "loading" ? (
            <Card padding="none" className="overflow-hidden" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex gap-4 border-t border-line px-4 py-3 first:border-t-0">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="hidden h-4 flex-1 md:block" />
                </div>
              ))}
            </Card>
          ) : state === "error" ? (
            <Card>
              <EmptyState
                icon="error"
                title="Couldn't load logs."
                action={
                  <Button variant="secondary" onClick={() => {
                    setState("loading");
                    setReloadKey((k) => k + 1);
                  }}>
                    Retry
                  </Button>
                }
              />
            </Card>
          ) : rows.length === 0 ? (
            <Card>
              <EmptyState
                icon="receipt_long"
                title="No logs match these filters."
                action={
                  filtered ? (
                    <Button variant="secondary" onClick={clearAll}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <>
              <LogsTable rows={rows} selectedId={selectedId} onSelect={setSelectedId} />
              {hasMore && (
                <div className="mt-3 flex justify-center">
                  <Button variant="secondary" onClick={loadOlder} loading={loadingMore} loadingLabel="Loading...">
                    Load older
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
        {selected && (
          <LogDetail
            row={selected}
            onClose={() => setSelectedId(null)}
            onShowRequest={(req) => {
              setSelectedId(selected.id);
              update({ ...EMPTY_LOG_FILTERS, req });
              setSearchText("");
              setActionText("");
            }}
          />
        )}
      </div>
    </section>
  );
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function FilterChip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number | null;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap",
        active ? "border-accent bg-accent-tint text-accent" : "border-line bg-surface text-ink hover:bg-surface2",
      )}
    >
      {active && <Icon name="check" size={14} />}
      {children}
      {count !== undefined && count !== null && <span className="font-mono text-xs text-muted">{count}</span>}
    </button>
  );
}

function ActiveTag({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex h-8 items-center gap-1 rounded-full bg-accent-tint pr-1 pl-3 font-mono text-xs text-accent">
      {label}
      <button type="button" aria-label={`Remove filter ${label}`} onClick={onClear} className="grid h-6 w-6 place-items-center rounded-full hover:bg-surface">
        <Icon name="close" size={14} />
      </button>
    </span>
  );
}

function LogsTable({ rows, selectedId, onSelect }: { rows: LogRowFull[]; selectedId: number | null; onSelect: (id: number) => void }) {
  return (
    <>
      <Card padding="none" className="hidden max-h-[70vh] overflow-auto md:block">
        <table className="w-full text-left text-[13px]">
          <thead className="sticky top-0 z-10 bg-surface2 text-xs font-semibold text-muted">
            <tr>
              <th className="px-3 py-2.5">Time</th>
              <th className="px-3 py-2.5">Level</th>
              <th className="px-3 py-2.5">Source</th>
              <th className="px-3 py-2.5">Action</th>
              <th className="px-3 py-2.5">Message</th>
              <th className="px-3 py-2.5">Request ID</th>
              <th className="px-3 py-2.5 text-right">ms</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => onSelect(r.id)}
                aria-selected={r.id === selectedId}
                className={cn(
                  "cursor-pointer border-t border-line",
                  r.level === "error" ? "bg-err-tint" : "hover:bg-surface2/60",
                  r.id === selectedId && "outline-2 -outline-offset-2 outline-accent",
                )}
              >
                <td className="px-3 py-2 font-mono whitespace-nowrap text-muted" title={logTimestamp(r.created_at)}>
                  {logTime(r.created_at)}
                </td>
                <td className="px-3 py-2">
                  <LevelPill level={r.level} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-muted">{SOURCE_LABELS[r.source] ?? r.source}</td>
                <td className="px-3 py-2 font-mono whitespace-nowrap text-ink">{r.action}</td>
                <td className="max-w-[320px] truncate px-3 py-2 text-ink">{r.message ?? ""}</td>
                <td className="px-3 py-2 font-mono whitespace-nowrap text-muted" title={r.request_id ?? undefined}>
                  {shortId(r.request_id)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-muted">{r.duration_ms ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              className={cn("w-full rounded-[14px] border border-line p-3 text-left", r.level === "error" ? "bg-err-tint" : "bg-surface")}
            >
              <div className="flex items-center gap-2">
                <LevelPill level={r.level} />
                <span className="truncate font-mono text-[13px] text-ink">{r.action}</span>
                <span className="ml-auto font-mono text-xs text-muted">{logTime(r.created_at).slice(0, 8)}</span>
              </div>
              {r.message && <p className="mt-1.5 line-clamp-2 text-[13px] text-muted">{r.message}</p>}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function LogDetail({ row, onClose, onShowRequest }: { row: LogRowFull; onClose: () => void; onShowRequest: (req: string) => void }) {
  const toast = useToast();

  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(message);
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  }

  const promptRow: DebugPromptRow = {
    action: row.action as DebugPromptRow["action"],
    level: row.level,
    source: row.source as LogSource,
    created_at: row.created_at,
    request_id: row.request_id,
    hat_code: row.hat_code,
    run_id: row.run_id,
    duration_ms: row.duration_ms,
    message: row.message,
    payload: row.payload ?? {},
    error: row.error,
  };

  const fields: [string, React.ReactNode][] = [
    ["Message", row.message || "None"],
    ["Time", <span key="t" className="font-mono">{logTimestamp(row.created_at)}</span>],
    ["Source", SOURCE_LABELS[row.source] ?? row.source],
    ["User", row.user_id ? <span key="u" className="font-mono">{shortId(row.user_id, 8)}</span> : "None"],
    [
      "Request ID",
      row.request_id ? <span key="r" className="font-mono">{row.request_id}</span> : "None",
    ],
    ["Hat", row.hat_code ? <Link key="h" href={`/hats/${row.hat_code}`} className="font-mono text-accent hover:underline">{row.hat_code}</Link> : "None"],
    ["Run", row.run_id ? <Link key="run" href={`/runs/${row.run_id}`} className="font-mono text-accent hover:underline">{shortId(row.run_id, 8)}</Link> : "None"],
    ["Duration", row.duration_ms !== null ? `${row.duration_ms} ms` : "None"],
  ];

  return (
    <aside
      aria-label="Log row detail"
      className={cn(
        "fixed inset-0 z-40 flex flex-col overflow-y-auto bg-surface",
        "md:inset-y-0 md:right-0 md:left-auto md:w-[440px] md:border-l md:border-line md:shadow-card",
        "min-[1180px]:sticky min-[1180px]:top-4 min-[1180px]:z-auto min-[1180px]:max-h-[calc(100vh-2rem)] min-[1180px]:shrink-0 min-[1180px]:rounded-[16px] min-[1180px]:border min-[1180px]:shadow-none",
      )}
    >
      <div className="sticky top-0 flex items-center gap-2 border-b border-line bg-surface px-4 py-3">
        <LevelPill level={row.level} />
        <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-ink">{row.action}</span>
        <Button variant="ghost" size="icon" aria-label="Close detail" onClick={onClose}>
          <Icon name="close" />
        </Button>
      </div>
      <div className="flex flex-col gap-4 p-4">
        <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-[13px]">
          {fields.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="min-w-0 break-words text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        {row.error && (
          <div className="rounded-[10px] bg-code p-3 font-mono text-xs text-code-text">
            <p className="font-semibold text-[var(--json-bool)]">{row.error.message}</p>
            {row.error.stack && <pre className="mt-2 overflow-auto whitespace-pre-wrap text-code-text/80">{row.error.stack}</pre>}
          </div>
        )}
        <JsonView value={row.payload ?? {}} />
        <div className="flex flex-col gap-2">
          <Button icon="smart_toy" onClick={() => copy(buildDebugPrompt(promptRow), "Copied. Paste it into your AI assistant.")}>
            Copy as prompt for an AI assistant
          </Button>
          <Button variant="secondary" icon="content_copy" disabled={!row.request_id} onClick={() => row.request_id && copy(row.request_id, "Request ID copied.")}>
            Copy request ID
          </Button>
          <Button variant="secondary" icon="filter_list" disabled={!row.request_id} onClick={() => row.request_id && onShowRequest(row.request_id)}>
            Show all rows for this request
          </Button>
        </div>
      </div>
    </aside>
  );
}
