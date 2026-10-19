// D14 undo as delayed commit: approvals wait 10 s in the browser before they are sent.
// Pure queue operations; the hook owns the timer and the network call.
import type { Edits } from "./proposals";

export const UNDO_MS = 10_000;

export interface QueuedDecision {
  proposal_id: string;
  edits?: Edits;
  dueAt: number;
}

export function enqueue(
  queue: readonly QueuedDecision[],
  items: { proposal_id: string; edits?: Edits }[],
  now: number,
): QueuedDecision[] {
  const ids = new Set(items.map((i) => i.proposal_id));
  return [...queue.filter((q) => !ids.has(q.proposal_id)), ...items.map((i) => ({ ...i, dueAt: now + UNDO_MS }))];
}

export function cancel(queue: readonly QueuedDecision[], ids: readonly string[]): QueuedDecision[] {
  const drop = new Set(ids);
  return queue.filter((q) => !drop.has(q.proposal_id));
}

/** Splits the queue into entries that are due (to send in one call) and the rest. */
export function takeDue(
  queue: readonly QueuedDecision[],
  now: number,
): { due: QueuedDecision[]; rest: QueuedDecision[] } {
  const due: QueuedDecision[] = [];
  const rest: QueuedDecision[] = [];
  for (const q of queue) (q.dueAt <= now ? due : rest).push(q);
  return { due, rest };
}

/** Takes specific ids now (toast expired early, tab hidden). */
export function takeIds(
  queue: readonly QueuedDecision[],
  ids: readonly string[] | "all",
): { due: QueuedDecision[]; rest: QueuedDecision[] } {
  if (ids === "all") return { due: [...queue], rest: [] };
  const want = new Set(ids);
  return { due: queue.filter((q) => want.has(q.proposal_id)), rest: queue.filter((q) => !want.has(q.proposal_id)) };
}
