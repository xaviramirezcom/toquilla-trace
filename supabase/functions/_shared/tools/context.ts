// Workshop agent tools, part 1: data shapes, the per-run context and the helpers every handler uses.
// Only relative imports of zero-import files, so Vitest and the Next.js type check can load it.
import {
  type Actor,
  type Grade,
  GRADES,
  type HatEventLike,
  type HatLike,
  FINISHED_STAGE,
  type ProposalType,
  foldText,
  normalizeCode,
  quoteInNote,
} from "../domain.ts";
import type { LogAction } from "../log-format.ts";

export type { ProposalType };

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

export interface WeaverRow {
  id: string;
  name: string;
  village: string | null;
  province: string | null;
  specialty: string[] | null;
}

export interface HatRow extends HatLike {
  id: string;
  straw: string | null;
  version: number;
}

/** Workshop-scoped reads. The real one uses the user's JWT (RLS) plus a workshop_id filter. */
export interface DataLayer {
  listWeavers(): Promise<WeaverRow[]>;
  listHats(): Promise<HatRow[]>;
  getHatByCode(code: string): Promise<HatRow | null>;
  getEvents(hatId: string): Promise<HatEventLike[]>;
  getOpenFlags(hatId: string): Promise<{ kind: string; message: string }[]>;
  /** True when a pending or question proposal from an earlier run targets this hat. */
  hasOpenProposal(hatId: string): Promise<boolean>;
}

export interface LogCtx {
  message?: string;
  payload?: Record<string, unknown>;
  hat_code?: string | null;
  duration_ms?: number;
}

/** Subset of the server logger used by tools and the loop (so tests can pass a memory logger). */
export interface ToolLogger {
  info(action: LogAction, c?: LogCtx): void;
  warn(action: LogAction, c?: LogCtx): void;
  error(action: LogAction, err: unknown, c?: LogCtx): void;
}

export type ProposalStatus = "pending" | "question" | "blocked";

export interface RuleResultJson {
  allowed: boolean;
  code: string | null;
  message: string;
  fix: Record<string, unknown> | null;
  warnings: string[];
  warning_messages?: string[];
  confirmed_by_record?: boolean;
  checked_at: string;
}

export interface BufferedProposal {
  temp_id: string;
  type: ProposalType;
  status: ProposalStatus;
  payload: Record<string, unknown>;
  why: string;
  quote: string;
  confidence: "high" | "check";
  rule_result: RuleResultJson | null;
}

/** agent_runs.steps entries (spec 03 section 5 and spec 09 section 5.3, merged). */
export type AgentStep =
  | {
      i: number;
      kind: "model_call";
      at: string;
      iteration: number;
      stop_reason: string;
      text: string | null;
      tokens_in: number;
      tokens_out: number;
      cache_read: number;
      duration_ms: number;
      model: string;
      function_calls: string[];
    }
  | {
      i: number;
      kind: "tool_call";
      at: string;
      name: string;
      tool: string;
      access: "read" | "write_proposed";
      input: unknown;
      output: unknown;
      is_error: boolean;
      duration_ms: number;
    }
  | {
      i: number;
      kind: "rule_check";
      at: string;
      rule: string;
      hat_code: string | null;
      allowed: boolean;
      code: string | null;
      message: string;
      reason: string;
      duration_ms: number;
    }
  | {
      i: number;
      kind: "proposal";
      at: string;
      temp_id: string;
      proposal_id: string;
      type: ProposalType;
      status: ProposalStatus;
      summary: string;
    }
  | {
      i: number;
      kind: "error";
      at: string;
      code: string;
      message: string;
      error: { type: string; message: string; status?: number };
    };

/** Distributive Omit so each step variant keeps its own fields. */
export type StepInput = AgentStep extends infer S ? (S extends AgentStep ? Omit<S, "i" | "at"> : never) : never;

export interface SeenHat {
  hat: HatRow;
  match: "exact" | "confusable" | "fuzzy";
  heard: string;
  /** How the hat was found; hats found only by stage can't be acted on (bulk injection guard). */
  via: "code" | "weaver" | "stage" | "tag";
  grounded: boolean;
  /** For via "weaver": every hat that weaver lookup returned. More than one means "which one?". */
  group?: string[];
  /** For via "weaver": the name as the model searched it (the quote must contain a word of it). */
  weaverQuery?: string;
}

export interface RunContext {
  note: string;
  hatTag: string | null;
  actor: Actor;
  now: () => string;
  data: DataLayer;
  logger?: ToolLogger;
  seenWeavers: Map<string, WeaverRow>;
  /** Smallest match count of any find_weaver call that returned this weaver. */
  weaverLookupSize: Map<string, number>;
  seenHats: Map<string, SeenHat>;
  proposals: BufferedProposal[];
  steps: AgentStep[];
  toolCalls: number;
  /** Codes and names a lookup returned nothing for (the code summary may say "could not find"). */
  notFound: Set<string>;
  cache: { weavers?: WeaverRow[]; hats?: HatRow[] };
}

export const MAX_PROPOSALS = 10;
export const MAX_FIND_RESULTS = 20;
export const STEP_FIELD_LIMIT = 4096;

export function createRunContext(opts: {
  note: string;
  hatTag?: string | null;
  actor: Actor;
  data: DataLayer;
  logger?: ToolLogger;
  now?: () => string;
}): RunContext {
  return {
    note: opts.note,
    hatTag: opts.hatTag ?? null,
    actor: opts.actor,
    now: opts.now ?? (() => new Date().toISOString()),
    data: opts.data,
    logger: opts.logger,
    seenWeavers: new Map(),
    weaverLookupSize: new Map(),
    seenHats: new Map(),
    proposals: [],
    steps: [],
    toolCalls: 0,
    notFound: new Set(),
    cache: {},
  };
}

export function pushStep(ctx: RunContext, step: StepInput): void {
  ctx.steps.push({ ...step, i: ctx.steps.length, at: ctx.now() } as AgentStep);
}

/** Loads the tagged hat (workshop scoped) into seenHats. Returns false when it does not exist. */
export async function preloadHatTag(ctx: RunContext): Promise<boolean> {
  if (!ctx.hatTag) return true;
  const hat = await ctx.data.getHatByCode(ctx.hatTag);
  if (!hat) return false;
  ctx.seenHats.set(hat.code, { hat, match: "exact", heard: ctx.hatTag, via: "tag", grounded: true });
  return true;
}

// ---------------------------------------------------------------------------
// Argument helpers (the model's JSON is untrusted: re-check everything, D18)
// ---------------------------------------------------------------------------

export type Args = Record<string, unknown>;

export class ToolError extends Error {
  readonly extra: Record<string, unknown>;
  constructor(message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.extra = extra;
  }
}

export function fail(message: string, extra?: Record<string, unknown>): never {
  throw new ToolError(message, extra);
}

export function optStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

export function optInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : NaN;
}

export function isGrade(v: string): v is Grade {
  return (GRADES as readonly string[]).includes(v);
}

export function confidenceOf(v: unknown): "high" | "check" {
  return v === "high" ? "high" : "check";
}

export function requireQuote(ctx: RunContext, quote: unknown): string {
  const q = typeof quote === "string" ? quote.trim() : "";
  const escaped = ctx.note.replaceAll("<", "&lt;");
  if (!q || !(quoteInNote(q, ctx.note) || quoteInNote(q, escaped))) {
    fail("The quote must be words copied exactly from the note.");
  }
  return q;
}

export function requireWhy(why: unknown): string {
  const w = typeof why === "string" ? why.trim() : "";
  if (!w) fail("why is required: one plain English sentence.");
  return w.slice(0, 300);
}

export function checkLimit(ctx: RunContext): void {
  if (ctx.proposals.length >= MAX_PROPOSALS) fail("Limit of 10 proposals per note reached. Stop and summarize.");
}

export function compact(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** A code lookup is grounded when the heard code really appears in the note. */
export function codeInNote(note: string, heard: string): boolean {
  let body = compact(heard);
  if (body.startsWith("TQ") && body.length === 7) body = body.slice(2);
  return body.length >= 4 && compact(note).includes(body);
}

/** Name words that say nothing about who is meant ("María de la Cruz" is not "mentioned" by "de"). */
const NAME_STOP_WORDS = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "da", "do", "dos", "san", "santa"]);

/** True when a word of the name (2+ letters, not a stop word) starts a word of the text. */
export function nameInNote(note: string, name: string): boolean {
  const n = ` ${foldText(note).replace(/[^a-z0-9 ]/g, " ")} `;
  const words = foldText(name)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !NAME_STOP_WORDS.has(w));
  return words.some((w) => n.includes(` ${w}`));
}

export function nowRule(ctx: RunContext, r: Omit<RuleResultJson, "checked_at">): RuleResultJson {
  return { ...r, checked_at: ctx.now() };
}

export function logRule(
  ctx: RunContext,
  rule: string,
  hatCode: string | null,
  allowed: boolean,
  code: string | null,
  message: string,
  extra: Record<string, unknown> = {},
): void {
  const t0 = Date.now();
  pushStep(ctx, {
    kind: "rule_check",
    rule,
    hat_code: hatCode,
    allowed,
    code,
    message,
    reason: message,
    duration_ms: Date.now() - t0,
  });
  const c: LogCtx = {
    hat_code: hatCode,
    message: allowed ? `${rule} allowed` : `${rule} blocked: ${code}`,
    payload: { rule, hat_code: hatCode, allowed, code, message, ...extra },
  };
  if (allowed) ctx.logger?.info("agent.rule.check", c);
  else ctx.logger?.warn("agent.rule.check", c);
}

export function addProposal(ctx: RunContext, p: Omit<BufferedProposal, "temp_id">, summary: string): BufferedProposal {
  const proposal: BufferedProposal = { ...p, temp_id: `p${ctx.proposals.length + 1}` };
  ctx.proposals.push(proposal);
  pushStep(ctx, {
    kind: "proposal",
    temp_id: proposal.temp_id,
    proposal_id: proposal.temp_id,
    type: proposal.type,
    status: proposal.status,
    summary,
  });
  return proposal;
}

export async function workshopWeavers(ctx: RunContext): Promise<WeaverRow[]> {
  if (!ctx.cache.weavers) ctx.cache.weavers = await ctx.data.listWeavers();
  return ctx.cache.weavers;
}

export async function workshopHats(ctx: RunContext): Promise<HatRow[]> {
  if (!ctx.cache.hats) ctx.cache.hats = await ctx.data.listHats();
  return ctx.cache.hats;
}

export function isOpen(h: HatRow): boolean {
  return !h.archived && h.stage < FINISHED_STAGE;
}

export function seenHat(ctx: RunContext, code: unknown): SeenHat | null {
  const n = typeof code === "string" ? normalizeCode(code) : null;
  if (!n) return null;
  return ctx.seenHats.get(n) ?? null;
}

export function rememberHat(ctx: RunContext, entry: SeenHat): void {
  const prev = ctx.seenHats.get(entry.hat.code);
  // Keep the strongest evidence: a grounded exact match wins over weaker ones.
  if (prev) {
    const rank = (s: SeenHat) => (s.grounded ? 2 : 0) + (s.match === "exact" ? 1 : 0);
    if (rank(prev) >= rank(entry)) return;
  }
  ctx.seenHats.set(entry.hat.code, entry);
}
