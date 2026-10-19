"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { approveAllSelection, completionText, rejectAllSelection } from "@/lib/workshop/proposals";
import { ProposalCard } from "./ProposalCard";
import type { ProposalsApi } from "./useProposals";

export function ProposalPanel({
  api,
  isAdmin,
  workshopId,
  onWriteAnother,
}: {
  api: ProposalsApi;
  isAdmin: boolean;
  workshopId: string | null;
  onWriteAnother: () => void;
}) {
  const { cards, loading, loadError, now, complete } = api;
  const approvable = approveAllSelection(cards).length;
  const rejectable = rejectAllSelection(cards).length;

  return (
    <section id="proposals" aria-labelledby="proposals-title" className="flex flex-col gap-3 scroll-mt-20">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="proposals-title" className="text-[18px] font-semibold text-ink">
          Review proposals ({cards.length})
        </h2>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Button variant="ghost" onClick={api.rejectAll} disabled={rejectable === 0}>
            Reject all
          </Button>
          <Button icon="done_all" onClick={api.approveAll} disabled={approvable === 0}>
            Approve all valid ({approvable})
          </Button>
        </div>
      </div>

      {cards.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-5 rounded-[4px] border-[1.5px] border-dashed border-accent bg-accent-tint" aria-hidden />
            Proposed by AI
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-5 rounded-[4px] border-[1.5px] border-ok bg-ok-tint" aria-hidden />
            Approved
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-5 rounded-[4px] border-[1.5px] border-err bg-err-tint" aria-hidden />
            Blocked by rules
          </span>
          <span className="ml-auto hidden md:inline">
            Focus a card, then <kbd className="font-mono">A</kbd> <kbd className="font-mono">E</kbd>{" "}
            <kbd className="font-mono">R</kbd>
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading proposals">
          <Skeleton className="h-36 w-full rounded-[14px]" />
          <Skeleton className="h-36 w-full rounded-[14px]" />
        </div>
      ) : loadError && cards.length === 0 ? (
        <div role="alert" className="flex items-center gap-3 rounded-[14px] border border-err bg-err-tint p-4 text-[14px] text-ink">
          <Icon name="error" size={20} className="text-err" />
          <span className="flex-1">Couldn&apos;t load proposals.</span>
          <Button size="sm" variant="secondary" icon="refresh" onClick={() => void api.load()}>
            Try again
          </Button>
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-[16px] border border-line bg-surface">
          <EmptyState
            icon="auto_awesome"
            title="No proposals yet"
            description="No proposals yet. Hold the mic and tell me what happened, and I'll prepare changes for you to approve."
          />
        </div>
      ) : (
        <>
          {complete && (
            <div className="flex flex-col gap-3 rounded-[16px] border-[1.5px] border-ok bg-ok-tint p-4 animate-enter md:flex-row md:items-center">
              <p className="flex flex-1 items-center gap-2 text-[15px] font-semibold text-ink" role="status">
                <Icon name="task_alt" size={22} className="text-ok" />
                {completionText(cards)}
              </p>
              <div className="flex gap-2">
                <Link
                  href="/hats"
                  className="inline-flex h-11 items-center rounded-[10px] border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface2"
                >
                  View updated hats
                </Link>
                <Button icon="edit_note" onClick={onWriteAnother}>
                  Write another note
                </Button>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-3">
            {cards.map((c) => (
              <ProposalCard key={c.row.id} card={c} api={api} now={now} isAdmin={isAdmin} workshopId={workshopId} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** Mobile docked bar (48px controls): mic, Reject all, Approve all valid. */
export function MobileApproveBar({ api, onMic }: { api: ProposalsApi; onMic: () => void }) {
  const approvable = approveAllSelection(api.cards).length;
  const rejectable = rejectAllSelection(api.cards).length;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onMic}
        aria-label="Record another update"
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent-tint text-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Icon name="mic" size={24} />
      </button>
      <Button variant="secondary" className="h-12" onClick={api.rejectAll} disabled={rejectable === 0}>
        Reject all
      </Button>
      <Button className="h-12 flex-1" icon="done_all" onClick={api.approveAll} disabled={approvable === 0}>
        Approve all valid ({approvable})
      </Button>
    </div>
  );
}
