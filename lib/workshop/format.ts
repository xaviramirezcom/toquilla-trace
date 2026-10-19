// Pure display helpers for the Workshop dashboard.
import { formatUsd } from "@domain/pricing";
import { stageName } from "@domain/domain";

export function greeting(hour: number, name: string): string {
  const first = name.trim().split(/\s+/)[0] || name;
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return `Good ${part}, ${first}`;
}

export function relativeTime(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  return new Date(t).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

export function absoluteTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
}

export interface AgentMeta {
  tool_calls?: number;
  latency_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

/** Members: "4 actions prepared · 2.1 s". Admins: "4 tool calls · 2.1 s · $0.0004" (+ View trace link). */
export function metaRowText(args: {
  role: "member" | "admin";
  proposals: number;
  meta?: AgentMeta | null;
  clientMs: number;
}): string {
  const ms = args.meta?.latency_ms ?? args.clientMs;
  if (args.role === "admin" && args.meta) {
    const calls = args.meta.tool_calls ?? 0;
    return `${calls} tool ${calls === 1 ? "call" : "calls"} · ${seconds(ms)} · ${formatUsd(args.meta.cost_usd)}`;
  }
  return `${args.proposals} ${args.proposals === 1 ? "action" : "actions"} prepared · ${seconds(ms)}`;
}

export interface ActivityEvent {
  id: string;
  type: string;
  from_stage: number | null;
  to_stage: number | null;
  source: string | null;
  actor_id: string | null;
  created_at: string;
  hat_code: string;
}

export function activityText(e: ActivityEvent): { icon: string; text: string } {
  switch (e.type) {
    case "created":
      return { icon: "add_circle", text: `${e.hat_code} created` };
    case "stage_advanced":
      return { icon: "trending_flat", text: `${e.hat_code} moved to ${stageName(e.to_stage ?? -1) ?? "the next stage"}` };
    case "flag_raised":
      return { icon: "flag", text: `Flag raised on ${e.hat_code}` };
    case "flag_reviewed":
      return { icon: "task_alt", text: `Flag reviewed on ${e.hat_code}` };
    case "edited":
      return { icon: "edit", text: `${e.hat_code} edited` };
    case "transferred":
      return { icon: "swap_horiz", text: `${e.hat_code} transferred` };
    case "claimed":
      return { icon: "verified", text: `${e.hat_code} claimed by its buyer` };
    case "archived":
      return { icon: "archive", text: `${e.hat_code} archived` };
    default:
      return { icon: "history", text: `${e.hat_code} updated` };
  }
}

export function activityActor(e: ActivityEvent, userId: string): string {
  const who = e.actor_id === null ? "System" : e.actor_id === userId ? "You" : "Workshop member";
  return e.source === "ai_proposal" ? `${who} (approved from AI)` : who;
}

/** Copy for agent call failures shown on the failed card. */
export function agentErrorCopy(code: string): string {
  if (code === "rate_limited") return "You've sent a lot of notes. Try again in a few minutes.";
  return "The assistant couldn't finish. Your note is still here.";
}
