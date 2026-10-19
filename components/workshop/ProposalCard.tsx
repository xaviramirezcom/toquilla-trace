"use client";

import Link from "next/link";
import { useState, type KeyboardEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { cardView, inUndoWindow, type Card } from "@/lib/workshop/proposals";
import { ProposalEditForm } from "./ProposalEditForm";
import { ReferenceCopy } from "./ReferenceCopy";
import type { ProposalsApi } from "./useProposals";

const TONE_CLASS = {
  proposed: "border-[1.5px] border-dashed border-accent bg-accent-tint",
  editing: "border-[1.5px] border-dashed border-accent bg-surface",
  approved: "border-[1.5px] border-solid border-ok bg-ok-tint",
  rejected: "border border-line bg-surface",
  blocked: "border-[1.5px] border-solid border-err bg-err-tint",
  question: "border-[1.5px] border-solid border-warn bg-warn-tint",
  failed: "border-[1.5px] border-solid border-err bg-surface",
} as const;

const STATUS_TONE = {
  proposed: "accent",
  editing: "accent",
  approved: "ok",
  rejected: "neutral",
  blocked: "err",
  question: "warn",
  failed: "err",
} as const;

export function ProposalCard({
  card,
  api,
  now,
  isAdmin,
  workshopId,
}: {
  card: Card;
  api: ProposalsApi;
  now: number;
  isAdmin: boolean;
  workshopId: string | null;
}) {
  const v = cardView(card);
  const fix = v.fix;
  const [whyOpen, setWhyOpen] = useState(false);
  const id = card.row.id;
  const undoOpen = inUndoWindow(card, now);

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.target !== e.currentTarget || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "a" && v.canApprove) {
      e.preventDefault();
      api.approve(id);
    } else if (k === "r" && v.canReject) {
      e.preventDefault();
      api.reject(id);
    } else if (k === "e" && v.canEdit) {
      e.preventDefault();
      api.startEdit(id);
    }
  }

  // State 5: rejected or dismissed, one muted line.
  if (v.tone === "rejected") {
    return (
      <article
        aria-label={`${v.statusLabel}: ${v.summary}`}
        className={cn("flex min-h-12 items-center gap-2 rounded-[14px] px-4 py-2 animate-enter", TONE_CLASS.rejected)}
      >
        <Icon name="close" size={18} className="text-muted" />
        <span className="min-w-0 flex-1 truncate text-[14px] text-muted line-through">{v.summary}</span>
        <span className="shrink-0 text-[13px] text-muted">
          {v.statusLabel} ·{" "}
          <button
            type="button"
            onClick={() => void api.restore(id)}
            className="min-h-11 font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Restore
          </button>
        </span>
      </article>
    );
  }

  return (
    <article
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label={`${v.typeLabel}: ${v.summary}. ${v.statusLabel}.`}
      className={cn(
        "rounded-[14px] p-4 animate-enter focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        TONE_CLASS[v.tone],
      )}
    >
      {/* Top row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral">{v.typeLabel}</Badge>
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent">
          <Icon name="auto_awesome" size={14} />
          Proposed by AI
        </span>
        {card.confidence === "high" && (
          <Badge tone="ok" icon="verified">
            High confidence
          </Badge>
        )}
        {card.confidence === "check" && (
          <Badge tone="warn" icon="visibility">
            Check this
          </Badge>
        )}
        {v.tag && (
          <Badge tone="info" icon="edit">
            {v.tag}
          </Badge>
        )}
        <span className="ml-auto">
          <Badge tone={STATUS_TONE[v.tone]} icon={v.statusIcon}>
            {v.statusLabel}
          </Badge>
        </span>
      </div>

      <p className="mt-2.5 text-[15px] font-semibold text-ink">{v.summary}</p>

      {v.tone !== "editing" && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Fields">
          {v.chips.map((chip) => (
            <li key={chip.label} className="rounded-full bg-surface/70 px-2.5 py-1 text-[12px] text-ink">
              <span className="text-muted">{chip.label}</span> {chip.label === "Hat" ? <span className="font-mono">{chip.value}</span> : chip.value}
            </li>
          ))}
        </ul>
      )}

      {v.stepper && v.tone !== "editing" && (
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-ink" aria-label={`From ${v.stepper.from} to ${v.stepper.to}`}>
          <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />
          {v.stepper.from}
          <Icon name="arrow_forward" size={16} className="text-muted" />
          <span
            className={cn("h-2.5 w-2.5 rounded-full border-2", v.stepper.blocked ? "border-err" : "border-accent")}
            aria-hidden
          />
          <span className={v.stepper.blocked ? "text-err" : undefined}>{v.stepper.to}</span>
        </p>
      )}

      {/* State-specific body */}
      {v.tone === "blocked" && v.message && (
        <p className="mt-3 flex items-start gap-2 text-[14px] text-ink">
          <Icon name="lock" size={18} className="mt-px text-err" />
          {v.message}
        </p>
      )}

      {v.tone === "question" && v.question && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="flex items-start gap-2 text-[14px] text-ink">
            <Icon name="help" size={18} className="mt-px text-warn" />
            {v.question.text}
          </p>
          <div className="flex flex-wrap gap-2">
            {v.question.choices.map((c) => (
              <button
                key={`${c.label}-${c.weaver_id ?? c.hat_code}`}
                type="button"
                disabled={!c.weaver_id}
                title={c.weaver_id ? undefined : "Reject this and send a new note that names the hat."}
                onClick={() => api.answer(id, c)}
                className="inline-flex min-h-11 items-center rounded-full border border-warn/60 bg-surface px-3.5 text-[13px] font-medium text-ink hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-45"
              >
                {c.label}
              </button>
            ))}
            {card.row.type === "create_hat" && (
              <button
                type="button"
                onClick={() => api.startEdit(id)}
                className="inline-flex min-h-11 items-center rounded-full border border-dashed border-line bg-surface px-3.5 text-[13px] font-medium text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
              >
                Someone else...
              </button>
            )}
          </div>
        </div>
      )}

      {v.tone === "failed" && (
        <div className="mt-3 flex flex-col gap-2">
          <p role="alert" className="flex items-start gap-2 text-[14px] text-ink">
            <Icon name="error" size={18} className="mt-px text-err" />
            {v.message}
          </p>
        </div>
      )}

      {v.tone === "approved" && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-ink">
          <Icon name="check_circle" size={18} className="text-ok" filled />
          Approved by you · just now
          {undoOpen && (
            <button
              type="button"
              onClick={() => api.undo([id])}
              className="min-h-11 px-1 font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            >
              Undo
            </button>
          )}
        </p>
      )}

      {v.tone === "editing" && (
        <div className="mt-3">
          <ProposalEditForm
            card={card}
            workshopId={workshopId}
            onSave={(draft) => api.saveEdit(id, draft)}
            onCancel={() => api.cancelEdit(id)}
          />
        </div>
      )}

      {/* Why? and actions */}
      {v.tone !== "editing" && (
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            {(card.row.why || card.row.quote) && (
              <>
                <button
                  type="button"
                  aria-expanded={whyOpen}
                  aria-controls={`why-${id}`}
                  onClick={() => setWhyOpen((o) => !o)}
                  className="inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-accent focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Icon name={whyOpen ? "expand_less" : "expand_more"} size={18} />
                  Why?
                </button>
                {whyOpen && (
                  <div id={`why-${id}`} className="mt-1 flex flex-col gap-1 text-[13px] text-ink">
                    {card.row.why && <p>{card.row.why}</p>}
                    {card.row.quote && <p className="text-muted italic">“{card.row.quote}”</p>}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 md:flex md:shrink-0 md:items-center">
            {v.tone === "blocked" ? (
              <>
                <Button variant="ghost" onClick={() => api.reject(id)}>
                  Dismiss
                </Button>
                {fix && (
                  <Button className="col-span-2" variant="secondary" icon="build" onClick={() => api.fix(id, fix.edits)}>
                    {fix.label}
                  </Button>
                )}
              </>
            ) : v.tone === "failed" ? (
              <>
                <div className="col-span-3 flex flex-wrap items-center justify-end gap-2">
                  {isAdmin ? (
                    card.requestId && (
                      <Link
                        href={`/logs?request_id=${encodeURIComponent(card.requestId)}`}
                        className="inline-flex h-11 items-center gap-1 rounded-[10px] px-3 text-[14px] font-semibold text-accent hover:bg-accent-tint"
                      >
                        View log
                      </Link>
                    )
                  ) : (
                    card.requestId && <ReferenceCopy requestId={card.requestId} />
                  )}
                  <Button icon="refresh" onClick={() => void api.retry(id)}>
                    Refresh and retry
                  </Button>
                </div>
              </>
            ) : v.tone === "proposed" || v.tone === "question" ? (
              <>
                <Button variant="ghost" onClick={() => api.reject(id)} disabled={!v.canReject}>
                  Reject
                </Button>
                <Button variant="secondary" icon="edit" onClick={() => api.startEdit(id)} disabled={!v.canEdit}>
                  Edit
                </Button>
                <Button
                  className="md:w-[132px]"
                  icon="check"
                  onClick={() => api.approve(id)}
                  disabled={!v.canApprove}
                  loading={card.status === "approving"}
                  loadingLabel="Approving..."
                >
                  Approve
                </Button>
              </>
            ) : null}
          </div>
        </div>
      )}
    </article>
  );
}
