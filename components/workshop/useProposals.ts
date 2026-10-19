"use client";

// Proposal list state and the decision queue (spec 04 section 6, D14).
// Approvals are held 10 s in the browser, then sent in one apply-proposals call; Undo cancels the
// timer, so the database never sees the mistake. Rejects are sent right away.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { log } from "@/lib/log";
import { newRequestId } from "@/lib/request-id";
import {
  callApplyProposals,
  currentAccessToken,
  flushApplyKeepalive,
  loadOpenProposals,
  loadRuleResults,
  readHatVersion,
  restoreProposal,
  type Decision,
} from "@/lib/workshop/api";
import {
  answerChoice,
  applyFix,
  applyResult,
  approveAllSelection,
  approveToastText,
  completionCounts,
  editsForSubmit,
  fromRow,
  isComplete,
  isOpen,
  mergeRun,
  rejectAllSelection,
  savedToastText,
  type Card,
  type Choice,
  type Edits,
  type ProposalRow,
} from "@/lib/workshop/proposals";
import { UNDO_MS, cancel, enqueue, takeDue, takeIds, type QueuedDecision } from "@/lib/workshop/queue";

export function useProposals(workshopId: string | null) {
  const toast = useToast();
  const router = useRouter();
  const [cards, setCardsState] = useState<Card[]>([]);
  const cardsRef = useRef<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const queueRef = useRef<QueuedDecision[]>([]);
  const [queuedIds, setQueuedIds] = useState<ReadonlySet<string>>(new Set());
  const tokenRef = useRef<string | null>(null);
  const savedThisRound = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Why a ref mirror of `cards`: callbacks (approve, reject, timers) need the latest list
  // synchronously, without being re-created on every change. Every write goes through setCards,
  // so the ref and the state never drift. queueRef works the same way for the decision queue.
  const setCards = useCallback((update: (prev: Card[]) => Card[]) => {
    const next = update(cardsRef.current);
    cardsRef.current = next;
    setCardsState(next);
  }, []);

  const setQueue = useCallback((q: QueuedDecision[]) => {
    queueRef.current = q;
    setQueuedIds(new Set(q.map((x) => x.proposal_id)));
  }, []);

  const patch = useCallback(
    (ids: readonly string[], fn: (c: Card) => Card) => {
      const set = new Set(ids);
      setCards((prev) => prev.map((c) => (set.has(c.row.id) ? fn(c) : c)));
    },
    [setCards],
  );

  /**
   * Re-render the server parts (the shell's pending badge) after a decision is saved. Debounced so
   * a burst of decisions refreshes once. During the 10 s undo window nothing is saved yet, so the
   * badge still counts those proposals until the commit lands (the database is the source).
   */
  const refreshServer = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, 300);
  }, [router]);
  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  const applyLoad = useCallback(
    (res: Awaited<ReturnType<typeof loadOpenProposals>>) => {
      if (res.ok) {
        setCards(() => res.data.map(fromRow));
        setLoadError(false);
      } else {
        setLoadError(true);
        log.error("ui.error", null, { payload: { where: "proposals.load", code: res.error.code } });
      }
      setLoading(false);
    },
    [setCards],
  );

  /** "Try again" after a load error. */
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    applyLoad(await loadOpenProposals(workshopId));
  }, [workshopId, applyLoad]);

  useEffect(() => {
    let cancelled = false;
    void loadOpenProposals(workshopId).then((res) => {
      if (!cancelled) applyLoad(res);
    });
    return () => {
      cancelled = true;
    };
  }, [workshopId, applyLoad]);

  const refreshToken = useCallback(async () => {
    tokenRef.current = await currentAccessToken();
  }, []);

  /** Blocked after approval: read the stored rule_result so the card can offer its fix. */
  const refreshBlocked = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const rules = await loadRuleResults(ids);
      patch(ids, (c) => (c.status === "blocked" && rules.get(c.row.id) ? { ...c, liveRule: rules.get(c.row.id) } : c));
    },
    [patch],
  );

  /** Sends queued approvals (already marked approved in the UI) in one call. */
  const commit = useCallback(
    async (due: QueuedDecision[]) => {
      if (due.length === 0) return;
      const requestId = newRequestId();
      const decisions: Decision[] = due.map((d) => ({ proposal_id: d.proposal_id, action: "approve", edits: d.edits }));
      const ids = due.map((d) => d.proposal_id);
      const res = await callApplyProposals(decisions, requestId);
      if (!res.ok) {
        log.error("ui.error", null, { request_id: requestId, payload: { where: "proposals.commit", code: res.error.code } });
        patch(ids, (c) => applyResult(c, { proposal_id: c.row.id, status: "failed", error: null }, res.error.requestId));
        return;
      }
      const byId = new Map(res.data.results.map((r) => [r.proposal_id, r]));
      let approved = 0;
      patch(ids, (c) => {
        const r = byId.get(c.row.id) ?? { proposal_id: c.row.id, status: "failed" as const, error: null };
        if (r.status === "approved") approved++;
        return applyResult(c, r, requestId);
      });
      savedThisRound.current += approved;
      refreshServer();
      await refreshBlocked(res.data.results.filter((r) => r.status === "blocked").map((r) => r.proposal_id));
    },
    [patch, refreshServer, refreshBlocked],
  );

  const flushIds = useCallback(
    (ids: readonly string[] | "all") => {
      const { due, rest } = takeIds(queueRef.current, ids);
      if (due.length === 0) return;
      setQueue(rest);
      void commit(due);
    },
    [commit, setQueue],
  );

  // Every second: send what is due, and tick `now` so Undo links disappear on time.
  // This interval is the normal sender. The toast's onExpire (below) only sends early when the
  // toast closes first (closed by hand or pushed out by newer toasts); a decision is sent once
  // because takeDue/takeIds remove it from the queue.
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      const { due, rest } = takeDue(queueRef.current, t);
      if (due.length) {
        setQueue(rest);
        void commit(due);
      }
      if (cardsRef.current.some((c) => c.undoUntil !== undefined && c.undoUntil > t - 1500)) setNow(t);
    }, 1000);
    return () => clearInterval(id);
  }, [commit, setQueue]);

  // Hidden tab or closing page: send queued approvals right away (keepalive survives unload).
  useEffect(() => {
    function flushNow() {
      const q = queueRef.current;
      if (q.length === 0) return;
      setQueue([]);
      if (document.visibilityState === "hidden") {
        flushApplyKeepalive(
          q.map((d) => ({ proposal_id: d.proposal_id, action: "approve", edits: d.edits })),
          newRequestId(),
          tokenRef.current,
        );
      } else {
        void commit(q);
      }
    }
    const onVis = () => {
      if (document.visibilityState === "hidden") flushNow();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flushNow);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", flushNow);
    };
  }, [commit, setQueue]);

  // "n changes saved." once everything is resolved and the last commit landed.
  const complete = isComplete(cards, now, queuedIds);
  useEffect(() => {
    if (complete && savedThisRound.current > 0) {
      toast.success(savedToastText(completionCounts(cardsRef.current).approved));
      savedThisRound.current = 0;
    }
  }, [complete, toast]);

  const undo = useCallback(
    (ids: string[]) => {
      const stillQueued = ids.filter((id) => queueRef.current.some((q) => q.proposal_id === id));
      if (stillQueued.length === 0) return;
      setQueue(cancel(queueRef.current, stillQueued));
      patch(stillQueued, (c) => ({ ...c, status: c.prevStatus, undoUntil: undefined }));
      log.info("proposal.undo", { payload: { proposal_ids: stillQueued, kind: "undo" } });
    },
    [patch, setQueue],
  );

  const approveMany = useCallback(
    (ids: string[]) => {
      const targets = cardsRef.current.filter((c) => ids.includes(c.row.id) && c.status === "pending");
      if (targets.length === 0) return;
      const t = Date.now();
      void refreshToken();
      setQueue(enqueue(queueRef.current, targets.map((c) => ({ proposal_id: c.row.id, edits: editsForSubmit(c) })), t));
      const targetIds = targets.map((c) => c.row.id);
      patch(targetIds, (c) => ({ ...c, prevStatus: "pending", status: "approved", undoUntil: t + UNDO_MS, message: undefined }));
      setNow(t);
      toast.undo(approveToastText(targets), {
        onUndo: () => undo(targetIds),
        onExpire: () => flushIds(targetIds),
      });
    },
    [flushIds, patch, refreshToken, setQueue, toast, undo],
  );

  const approve = useCallback((id: string) => approveMany([id]), [approveMany]);
  const approveAll = useCallback(() => approveMany(approveAllSelection(cardsRef.current)), [approveMany]);

  const rejectMany = useCallback(
    async (ids: string[]) => {
      const targets = cardsRef.current.filter((c) => ids.includes(c.row.id));
      if (targets.length === 0) return;
      const prev = new Map(targets.map((c) => [c.row.id, c]));
      patch(ids, (c) => ({
        ...c,
        prevStatus: c.status === "question" || c.status === "blocked" ? c.status : "pending",
        status: c.status === "blocked" ? "dismissed" : "rejected",
      }));
      const requestId = newRequestId();
      const res = await callApplyProposals(
        ids.map((id) => ({ proposal_id: id, action: "reject" })),
        requestId,
      );
      if (!res.ok) {
        patch(ids, (c) => prev.get(c.row.id) ?? c);
        toast.error(ids.length > 1 ? "Couldn't reject these proposals. Try again." : "Couldn't reject this proposal. Try again.");
        return;
      }
      const byId = new Map(res.data.results.map((r) => [r.proposal_id, r]));
      patch(ids, (c) => {
        const r = byId.get(c.row.id);
        if (!r || r.status === "rejected" || r.status === "dismissed") return r ? { ...c, status: r.status } : c;
        return prev.get(c.row.id) ?? c;
      });
      refreshServer();
    },
    [patch, refreshServer, toast],
  );

  const reject = useCallback((id: string) => void rejectMany([id]), [rejectMany]);
  const rejectAll = useCallback(() => void rejectMany(rejectAllSelection(cardsRef.current)), [rejectMany]);

  const restore = useCallback(
    async (id: string) => {
      const card = cardsRef.current.find((c) => c.row.id === id);
      if (!card) return;
      const before = card.status;
      patch([id], (c) => ({ ...c, status: c.prevStatus }));
      const res = await restoreProposal(id, card.prevStatus === "failed" ? "pending" : card.prevStatus);
      if (!res.ok) {
        patch([id], (c) => ({ ...c, status: before }));
        toast.error("Couldn't restore this proposal. Try again.");
        return;
      }
      log.info("proposal.undo", { payload: { proposal_ids: [id], kind: "restore" } });
      refreshServer();
    },
    [patch, refreshServer, toast],
  );

  const answer = useCallback(
    (id: string, choice: Choice) => {
      patch([id], (c) => answerChoice(c, choice));
      const card = cardsRef.current.find((c) => c.row.id === id);
      log.info("proposal.edit", { payload: { proposal_id: id, type: card?.row.type, via: "answer", fields: ["weaver_id"] } });
    },
    [patch],
  );

  const fix = useCallback(
    (id: string, edits: Edits) => {
      patch([id], (c) => applyFix(c, edits));
      const card = cardsRef.current.find((c) => c.row.id === id);
      log.info("proposal.edit", { payload: { proposal_id: id, type: card?.row.type, via: "fix", fields: Object.keys(edits) } });
    },
    [patch],
  );

  const startEdit = useCallback(
    (id: string) =>
      patch([id], (c) => ({
        ...c,
        prevStatus: c.status === "question" || c.status === "blocked" ? c.status : "pending",
        status: "editing",
      })),
    [patch],
  );
  const cancelEdit = useCallback((id: string) => patch([id], (c) => ({ ...c, status: c.prevStatus })), [patch]);
  const saveEdit = useCallback(
    (id: string, draft: Edits) => {
      patch([id], (c) => ({
        ...c,
        draft: { ...c.draft, ...draft },
        edited: true,
        status: "pending",
        prevStatus: "pending",
        confidence: "high",
        liveRule: null,
        message: undefined,
      }));
      const card = cardsRef.current.find((c) => c.row.id === id);
      log.info("proposal.edit", { payload: { proposal_id: id, type: card?.row.type, via: "form", fields: Object.keys(draft) } });
    },
    [patch],
  );

  /** Refresh and retry: read the current hat version, then approve immediately (no undo window). */
  const retry = useCallback(
    async (id: string) => {
      const card = cardsRef.current.find((c) => c.row.id === id);
      if (!card) return;
      patch([id], (c) => ({ ...c, status: "approving" }));
      let draft = card.draft;
      const hatId = typeof card.row.payload.hat_id === "string" ? card.row.payload.hat_id : null;
      if (card.row.type === "advance_stage" && hatId) {
        const fresh = await readHatVersion(hatId);
        if (fresh) draft = { ...draft, expected_version: fresh.version };
      }
      const updated = { ...card, draft };
      patch([id], (c) => ({ ...c, draft }));
      const requestId = newRequestId();
      const res = await callApplyProposals([{ proposal_id: id, action: "approve", edits: editsForSubmit(updated) }], requestId);
      if (!res.ok) {
        patch([id], (c) => applyResult(c, { proposal_id: id, status: "failed", error: null }, res.error.requestId));
        return;
      }
      const r = res.data.results.find((x) => x.proposal_id === id) ?? { proposal_id: id, status: "failed" as const };
      if (r.status === "approved") savedThisRound.current += 1;
      patch([id], (c) => applyResult(c, r, requestId));
      refreshServer();
      if (r.status === "blocked") await refreshBlocked([id]);
    },
    [patch, refreshServer, refreshBlocked],
  );

  const addRun = useCallback(
    (rows: ProposalRow[]) => {
      // A proposal without an id was not saved and can't be decided, so it is not shown.
      const saved = rows.filter((r) => typeof r.id === "string" && r.id.length > 0);
      const { cards: merged, earlierOpen } = mergeRun(cardsRef.current, saved, Date.now(), new Set(queueRef.current.map((q) => q.proposal_id)));
      setCards(() => merged);
      if (saved.length > 0) refreshServer();
      if (earlierOpen && saved.length > 0) toast.info("New proposals added. Earlier ones are still waiting below.");
    },
    [refreshServer, setCards, toast],
  );

  const clearResolved = useCallback(() => {
    flushIds("all");
    setCards((prev) => prev.filter((c) => c.status !== "approved" && c.status !== "rejected" && c.status !== "dismissed"));
  }, [flushIds, setCards]);

  const openCount = useMemo(() => cards.filter((c) => isOpen(c.status)).length, [cards]);

  return {
    cards,
    loading,
    loadError,
    now,
    queuedIds,
    complete,
    openCount,
    load,
    addRun,
    approve,
    approveAll,
    reject,
    rejectAll,
    restore,
    answer,
    fix,
    startEdit,
    cancelEdit,
    saveEdit,
    retry,
    undo,
    clearResolved,
  };
}

export type ProposalsApi = ReturnType<typeof useProposals>;
