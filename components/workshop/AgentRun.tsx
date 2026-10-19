"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { metaRowText, agentErrorCopy, type AgentMeta } from "@/lib/workshop/format";
import { AGENT_STEPS, type AgentError, type InputMode } from "@/lib/voice/reducer";
import { ReferenceCopy } from "./ReferenceCopy";

/**
 * D13 honest progress: generic steps every run really does, on a timer. A step gets its check only
 * when the next one starts; the last keeps spinning until the response arrives.
 */
export function AgentSteps({ step, onStop }: { step: number; onStop: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-line bg-surface2/60 p-3">
      <ol aria-live="polite" aria-label="Assistant progress" className="flex flex-col gap-2">
        {AGENT_STEPS.slice(0, step + 1).map((label, i) => (
          <li key={label} className="flex items-center gap-2 text-[14px] text-ink animate-enter">
            {i < step ? (
              <Icon name="check_circle" size={18} className="text-ok" label="Done" />
            ) : (
              <Spinner size={16} label="Working" />
            )}
            {label}
          </li>
        ))}
      </ol>
      <div>
        <Button size="sm" variant="secondary" icon="stop_circle" onClick={onStop}>
          Stop
        </Button>
      </div>
    </div>
  );
}

export function AgentFailedCard({
  error,
  requestId,
  isAdmin,
  onRetry,
}: {
  error: AgentError;
  requestId: string;
  isAdmin: boolean;
  onRetry: () => void;
}) {
  const expired = error.code === "unauthorized";
  const detailsHref = error.runId ? `/runs/${error.runId}` : `/logs?request_id=${encodeURIComponent(requestId)}`;
  return (
    <div role="alert" className="flex gap-2.5 rounded-[12px] border-[1.5px] border-err bg-err-tint p-3 text-[14px] text-ink">
      <Icon name="error" size={20} className="mt-px text-err" />
      <div className="min-w-0 flex-1">
        <p>{expired ? "Your session expired. Log in again to continue." : agentErrorCopy(error.code)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {expired ? (
            <Link
              href="/login?next=%2Fworkshop"
              className="inline-flex h-9 items-center rounded-[10px] bg-accent px-3 text-[13px] font-semibold text-on-accent hover:bg-accent-strong"
            >
              Log in
            </Link>
          ) : (
            <Button size="sm" icon="refresh" onClick={onRetry}>
              Try again
            </Button>
          )}
          {isAdmin ? (
            <Link
              href={detailsHref}
              className="inline-flex h-9 items-center gap-1 rounded-[10px] px-2 text-[13px] font-semibold text-accent hover:bg-accent-tint"
            >
              View details
              <Icon name="arrow_forward" size={16} />
            </Link>
          ) : (
            <ReferenceCopy requestId={requestId} />
          )}
        </div>
      </div>
    </div>
  );
}

export interface LastRun {
  note: string;
  inputMode: InputMode;
  hatTag?: string;
  summary: string;
  proposals: number;
  runId: string;
  meta?: AgentMeta | null;
  clientMs: number;
}

/** "You said / You wrote" bubble, the assistant summary and the meta row (member vs admin). */
export function RunBubbles({ run, isAdmin }: { run: LastRun; isAdmin: boolean }) {
  return (
    <section aria-label="Last note" className="flex flex-col gap-3">
      <div className="ml-auto max-w-[85%] rounded-[16px] rounded-br-[6px] bg-accent-tint px-4 py-3 text-[14px] text-ink">
        <p className="mb-1 flex items-center gap-1 text-[12px] font-semibold text-muted">
          {run.inputMode === "voice" && <Icon name="mic" size={14} />}
          {run.inputMode === "voice" ? "You said:" : "You wrote:"}
          {run.hatTag && <span className="ml-1 font-mono text-info">{run.hatTag}</span>}
        </p>
        <p className="whitespace-pre-wrap">{run.note}</p>
      </div>
      <div className="flex max-w-[92%] gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-on-accent" aria-hidden>
          <Icon name="auto_awesome" size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-muted">Assistant</p>
          <p className="text-[14px] whitespace-pre-wrap text-ink">{run.summary}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
            <span>
              {metaRowText({ role: isAdmin ? "admin" : "member", proposals: run.proposals, meta: run.meta, clientMs: run.clientMs })}
            </span>
            {isAdmin && run.runId && (
              <Link href={`/runs/${run.runId}`} className="font-semibold text-accent hover:underline">
                · View trace
              </Link>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
