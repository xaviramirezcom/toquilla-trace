"use client";

import Link from "next/link";
import { useState } from "react";
import { STAGES } from "@domain/domain";
import { Badge, Button, Card, Icon, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { logTimestamp } from "@/lib/admin/logs";
import {
  defaultOpenSteps,
  displayStatus,
  formatCost,
  formatLatency,
  normalizeSteps,
  statusTone,
  type ProposalRow,
  type RunListItem,
  type RunStep,
} from "@/lib/admin/runs";
import { JsonView } from "./JsonView";

export function RunDetail({ run, proposals }: { run: RunListItem; proposals: ProposalRow[] }) {
  const toast = useToast();
  const steps = normalizeSteps(run.steps);
  const [open, setOpen] = useState<Set<number>>(() => defaultOpenSteps(steps));
  const ds = displayStatus(run.status, run.proposal_statuses);

  async function copy(text: string, msg: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(msg);
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  }

  const meta: [string, string][] = [
    ["Agent", run.agent === "workshop" ? "Workshop agent" : run.agent === "concierge" ? "Buyer concierge" : run.agent],
    ["Started", logTimestamp(run.created_at)],
    ["User", run.user_name ?? (run.user_id ? run.user_id.slice(0, 8) : "Anonymous")],
    ["Latency", formatLatency(run.latency_ms)],
    ["Tokens in/out", `${run.tokens_in ?? 0} / ${run.tokens_out ?? 0}`],
    ["Cost", formatCost(run.cost_usd)],
    ["Model", run.model ?? "n/a"],
    ["Input mode", run.input_mode ?? "n/a"],
  ];

  return (
    <section className="max-w-[960px]">
      <nav aria-label="Breadcrumb" className="text-[13px] text-muted">
        <Link href="/runs" className="hover:underline">
          Agent runs
        </Link>{" "}
        / <span className="font-mono text-ink">{run.id.slice(0, 8)}</span>
      </nav>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="font-mono text-[20px] font-semibold break-all text-ink md:text-[24px]">{run.id}</h1>
        <Button variant="ghost" size="icon" aria-label="Copy run ID" onClick={() => copy(run.id, "Run ID copied.")}>
          <Icon name="content_copy" size={18} />
        </Button>
        <Badge tone={statusTone(ds)} pill>
          {ds}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon="data_object" onClick={() => copy(JSON.stringify({ ...run, proposals }, null, 2), "Run copied as JSON.")}>
          Copy run as JSON
        </Button>
        {run.request_id && (
          <Link
            href={`/logs?req=${run.request_id}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-surface2"
          >
            <Icon name="receipt_long" size={18} /> View logs for this run
          </Link>
        )}
      </div>

      <Card padding="lg" className="mt-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] sm:grid-cols-4">
          {meta.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="mt-0.5 font-mono break-words text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <h2 className="mt-6 text-[16px] font-semibold text-ink">Input</h2>
      <blockquote className="mt-2 rounded-[12px] border-l-4 border-accent bg-surface p-4 text-sm whitespace-pre-wrap text-ink">
        {run.input || "No input recorded."}
      </blockquote>
      {run.summary && <p className="mt-2 text-[13px] text-muted">Summary: {run.summary}</p>}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-[16px] font-semibold text-ink">Steps</h2>
        {steps.length > 0 && (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(new Set(steps.map((_, i) => i)))}>
              Expand all
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(new Set())}>
              Collapse all
            </Button>
          </div>
        )}
      </div>
      {steps.length === 0 ? (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-[13px] text-muted">No steps were recorded for this run.</p>
          {run.error ? <JsonView value={run.error} label="Error" /> : null}
        </div>
      ) : (
        <ol className="mt-2 flex flex-col gap-2">
          {steps.map((s, idx) => (
            <StepCard
              key={idx}
              n={idx + 1}
              step={s}
              open={open.has(idx)}
              onToggle={() =>
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(idx)) next.delete(idx);
                  else next.add(idx);
                  return next;
                })
              }
            />
          ))}
        </ol>
      )}
      {steps.length > 0 && run.error ? (
        <div className="mt-3">
          <JsonView value={run.error} label="Run error" />
        </div>
      ) : null}

      <h2 className="mt-6 text-[16px] font-semibold text-ink">Proposals and decisions</h2>
      {proposals.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted">This run made no proposals.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {proposals.map((p) => (
            <li key={p.id} className="rounded-[12px] border-[1.5px] border-dashed border-accent bg-accent-tint/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[13px] font-semibold text-ink">{p.type}</span>
                <Badge tone={p.status === "approved" ? "ok" : p.status === "blocked" || p.status === "failed" ? "err" : p.status === "pending" || p.status === "question" ? "accent" : "neutral"} pill>
                  {p.status}
                </Badge>
                {p.confidence === "check" && <Badge tone="warn">Check</Badge>}
              </div>
              <p className="mt-1 text-[13px] text-ink">{proposalSummary(p)}</p>
              {p.quote && <p className="mt-1 text-[13px] text-muted">&ldquo;{p.quote}&rdquo;</p>}
              {p.why && <p className="mt-1 text-xs text-muted">Why: {p.why}</p>}
              {p.decided_at && (
                <p className="mt-2 flex items-center gap-1 text-xs text-ink">
                  <Icon name={p.status === "approved" ? "check_circle" : "cancel"} size={14} />
                  {p.status === "approved" ? "Approved" : p.status === "rejected" ? "Rejected" : p.status === "dismissed" ? "Dismissed" : p.status} by{" "}
                  {p.decider_name ?? "someone"} · <span className="font-mono">{logTimestamp(p.decided_at).slice(11, 19)}</span>
                </p>
              )}
              {p.edited && p.edits && (
                <div className="mt-2">
                  <EditsTable before={p.payload ?? {}} edits={p.edits} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function proposalSummary(p: ProposalRow): string {
  const pl = (p.payload ?? {}) as Record<string, unknown>;
  const code = typeof pl.hat_code === "string" ? pl.hat_code : null;
  if (p.type === "advance_stage") {
    const to = typeof pl.to_stage === "number" ? STAGES[pl.to_stage] : null;
    return `Advance ${code ?? "a hat"}${to ? ` to ${to}` : ""}`;
  }
  if (p.type === "create_hat") {
    const parts = [pl.quantity ? `${pl.quantity} x` : null, pl.grade, pl.rows_per_inch ? `${pl.rows_per_inch} rows/in` : null].filter(Boolean);
    return `Create ${parts.join(" ") || "a hat"}`;
  }
  if (p.type === "flag_issue") return `Flag ${code ?? "a hat"}${typeof pl.message === "string" ? `: ${pl.message}` : ""}`;
  return p.type;
}

function EditsTable({ before, edits }: { before: Record<string, unknown>; edits: Record<string, unknown> }) {
  return (
    <table className="w-full text-left text-xs">
      <thead className="text-muted">
        <tr>
          <th className="py-1 pr-2">Field</th>
          <th className="py-1 pr-2">AI proposed</th>
          <th className="py-1">Approved as</th>
        </tr>
      </thead>
      <tbody className="font-mono">
        {Object.keys(edits).map((k) => (
          <tr key={k} className="border-t border-line">
            <td className="py-1 pr-2">{k}</td>
            <td className="py-1 pr-2 text-muted line-through">{JSON.stringify(before[k] ?? null)}</td>
            <td className="py-1 text-ink">{JSON.stringify(edits[k])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StepCard({ n, step, open, onToggle }: { n: number; step: RunStep; open: boolean; onToggle: () => void }) {
  const isError = step.kind === "error" || (step.kind === "tool_call" && step.is_error) || (step.kind === "rule_check" && !step.allowed);
  const title =
    step.kind === "model_call" ? (
      "Model call"
    ) : step.kind === "tool_call" ? (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="font-mono">{step.name}</span>
        <Badge tone={step.access === "read" ? "info" : "warn"}>{step.access === "read" ? "Read" : "Write: proposed only"}</Badge>
      </span>
    ) : step.kind === "rule_check" ? (
      <span className={step.allowed ? "text-ok" : "text-err"}>
        {step.allowed ? "Allowed" : "Blocked"}: {step.reason ?? step.rule ?? ""}
      </span>
    ) : step.kind === "proposal" ? (
      `Proposal: ${step.type ?? ""}`
    ) : (
      <span className="text-err">Error: {step.code ?? "unknown"}</span>
    );
  const right =
    step.kind === "model_call"
      ? `${step.tokens_in ?? 0} / ${step.tokens_out ?? 0} tok · ${formatLatency(step.duration_ms)}`
      : step.kind === "tool_call"
        ? formatLatency(step.duration_ms)
        : "";

  return (
    <li className={cn("rounded-[12px] border bg-surface", isError ? "border-err" : "border-line", step.kind === "proposal" && "border-dashed border-accent")}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface2 font-mono text-xs text-muted">{n}</span>
        <span className="min-w-0 flex-1 text-[13px] font-semibold text-ink">{title}</span>
        {right && <span className="hidden font-mono text-xs text-muted sm:inline">{right}</span>}
        <Icon name={open ? "expand_less" : "expand_more"} size={18} className="text-muted" />
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-line px-3 py-3 text-[13px]">
          {step.kind === "model_call" && (
            <>
              <p className="font-mono text-xs text-muted">
                stop: {step.stop_reason ?? "n/a"} · cache read: {step.cache_read ?? 0}
              </p>
              {step.text ? <p className="whitespace-pre-wrap text-ink">{step.text}</p> : <p className="text-muted">No text in this call.</p>}
            </>
          )}
          {step.kind === "tool_call" && (
            <>
              <JsonView value={step.input ?? {}} label="Input" maxHeight="max-h-60" />
              <JsonView value={step.output ?? {}} label="Output" maxHeight="max-h-60" />
            </>
          )}
          {step.kind === "rule_check" && (
            <p className="text-muted">
              Rule <span className="font-mono">{step.rule ?? "n/a"}</span>
              {step.hat_code ? (
                <>
                  {" "}
                  on <span className="font-mono">{step.hat_code}</span>
                </>
              ) : null}
            </p>
          )}
          {step.kind === "proposal" && (
            <p className="text-ink">
              {step.summary ?? ""} <span className="text-muted">(status at creation: {step.status ?? "n/a"})</span>
            </p>
          )}
          {step.kind === "error" && <JsonView value={{ code: step.code, message: step.message, detail: step.detail }} label="Error" />}
          <p className="font-mono text-xs text-muted">{step.at ? logTimestamp(step.at) : ""}</p>
        </div>
      )}
    </li>
  );
}
