"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { logTimestamp } from "@/lib/admin/logs";
import {
  displayStatus,
  formatCost,
  formatLatency,
  runDateStart,
  statusTone,
  summarizeRuns,
  toolCount,
  type RunDateRange,
  type RunListItem,
} from "@/lib/admin/runs";
import { relativeTime } from "@/lib/hats/format";

const AGENT_LABEL: Record<string, string> = { workshop: "Workshop agent", concierge: "Buyer concierge" };
const STATUSES = ["Proposed", "Partially approved", "Approved", "Rejected", "Failed", "Stopped", "Answered", "Refused"];

export function RunsList({ runs, nowIso, hat }: { runs: RunListItem[]; nowIso: string; hat: string | null }) {
  const [agent, setAgent] = useState("");
  const [status, setStatus] = useState("");
  const [range, setRange] = useState<RunDateRange>("30d");
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const start = runDateStart(range, new Date(nowIso)).toISOString();
    const needle = q.trim().toLowerCase();
    return runs.filter(
      (r) =>
        r.created_at >= start &&
        (!agent || r.agent === agent) &&
        (!status || displayStatus(r.status, r.proposal_statuses) === status) &&
        (!needle || (r.input ?? "").toLowerCase().includes(needle)),
    );
  }, [runs, agent, status, range, q, nowIso]);
  const summary = summarizeRuns(shown);
  const filtered = Boolean(agent || status || q || range !== "30d");

  const tiles: [string, string][] = [
    ["Runs", String(summary.runs)],
    ["Success rate", summary.successRate === null ? "n/a" : `${Math.round(summary.successRate * 100)}%`],
    ["Avg latency", formatLatency(summary.avgLatencyMs)],
    ["Avg cost", formatCost(summary.avgCostUsd)],
    ["Rule blocks", String(summary.ruleBlocks)],
  ];

  return (
    <section>
      <h1 className="text-[28px] font-semibold tracking-[-0.015em] text-ink">Agent runs</h1>
      <p className="text-[13px] text-muted">
        Every agent run with its steps, tokens and cost.
        {hat && (
          <>
            {" "}
            Showing runs that mention <span className="font-mono text-ink">{hat}</span>.{" "}
            <Link href="/runs" className="text-accent hover:underline">
              Show all
            </Link>
          </>
        )}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map(([k, v]) => (
          <Card key={k} padding="md">
            <p className="text-xs text-muted">{k}</p>
            <p className="mt-1 font-mono text-[22px] font-semibold text-ink">{v}</p>
          </Card>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <label className="relative min-w-[220px] flex-1 md:max-w-sm">
          <span className="sr-only">Search notes</span>
          <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes"
            className="h-10 w-full rounded-[10px] border border-line bg-surface pr-3 pl-10 text-sm text-ink placeholder:text-muted"
          />
        </label>
        <Select label="Agent" value={agent} onChange={setAgent} options={[["", "All agents"], ["workshop", "Workshop agent"], ["concierge", "Buyer concierge"]]} />
        <Select label="Status" value={status} onChange={setStatus} options={[["", "All statuses"], ...STATUSES.map((s) => [s, s] as [string, string])]} />
        <Select
          label="Date"
          value={range}
          onChange={(v) => setRange(v as RunDateRange)}
          options={[
            ["today", "Today"],
            ["7d", "Last 7 days"],
            ["30d", "Last 30 days"],
          ]}
        />
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            className="h-10"
            onClick={() => {
              setAgent("");
              setStatus("");
              setRange("30d");
              setQ("");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {shown.length === 0 ? (
        <Card className="mt-4">
          <EmptyState icon="account_tree" title={runs.length ? "No runs match these filters." : "No agent runs yet."} />
        </Card>
      ) : (
        <>
          <Card padding="none" className="mt-4 hidden overflow-auto md:block">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-surface2 text-xs font-semibold text-muted">
                <tr>
                  <th className="px-3 py-2.5">Started</th>
                  <th className="px-3 py-2.5">Agent</th>
                  <th className="px-3 py-2.5">User</th>
                  <th className="px-3 py-2.5">Input</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Tools</th>
                  <th className="px-3 py-2.5 text-right">Tokens in/out</th>
                  <th className="px-3 py-2.5 text-right">Latency</th>
                  <th className="px-3 py-2.5 text-right">Cost</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const ds = displayStatus(r.status, r.proposal_statuses);
                  return (
                    // The first cell's link is stretched over the whole row (after:inset-0), so the row
                    // is one keyboard-focusable link that a screen reader announces as such.
                    <tr key={r.id} className="relative border-t border-line focus-within:bg-surface2/60 hover:bg-surface2/60">
                      <td className="px-3 py-2 whitespace-nowrap text-muted" title={logTimestamp(r.created_at)}>
                        <Link
                          href={`/runs/${r.id}`}
                          className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent"
                        >
                          {relativeTime(r.created_at, nowIso)}
                          <span className="sr-only">, open run details</span>
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={r.agent === "workshop" ? "accent" : "info"}>{AGENT_LABEL[r.agent] ?? r.agent}</Badge>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-ink">{r.user_name ?? (r.user_id ? "Member" : "Anonymous")}</td>
                      <td className="max-w-[280px] truncate px-3 py-2 text-ink" title={r.input ?? undefined}>
                        {r.input ?? ""}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={statusTone(ds)} pill>
                          {ds}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{toolCount(r.steps)}</td>
                      <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                        {r.tokens_in ?? 0} / {r.tokens_out ?? 0}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatLatency(r.latency_ms)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCost(r.cost_usd)}</td>
                      <td className="pr-3 text-muted">
                        <Icon name="chevron_right" size={18} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <ul className="mt-4 flex flex-col gap-2 md:hidden">
            {shown.map((r) => {
              const ds = displayStatus(r.status, r.proposal_statuses);
              return (
                <li key={r.id}>
                  <Link href={`/runs/${r.id}`} className="block rounded-[14px] border border-line bg-surface p-3">
                    <div className="flex items-center gap-2">
                      <Badge tone={r.agent === "workshop" ? "accent" : "info"}>{AGENT_LABEL[r.agent] ?? r.agent}</Badge>
                      <Badge tone={statusTone(ds)} pill>
                        {ds}
                      </Badge>
                      <span className="ml-auto text-xs text-muted">{relativeTime(r.created_at, nowIso)}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[13px] text-ink">{r.input}</p>
                    <p className="mt-1 font-mono text-xs text-muted">
                      {toolCount(r.steps)} tools · {formatLatency(r.latency_ms)} · {formatCost(r.cost_usd)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("h-10 rounded-[10px] border border-line bg-surface px-3 text-sm text-ink")}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
