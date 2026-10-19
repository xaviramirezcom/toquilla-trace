// Workshop agent tools: declarations (sent to Gemini) and handlers (spec 03 section 6.6, D18, D26).
// Only relative imports of zero-import files, so Vitest and the Next.js type check can load it.
// Handlers never write records: read tools read through an injected DataLayer, propose tools only
// buffer proposals in the RunContext after the domain.ts rule checks.
import {
  type Actor,
  type Grade,
  GRADES,
  type HatEventLike,
  type HatLike,
  QUANTITY_MAX,
  QUANTITY_MIN,
  STAGES,
  STRAWS,
  canAdvance,
  detectAnomalies,
  foldText,
  gradeFor,
  gradeMismatch,
  gradeMismatchMessage,
  matchCode,
  matchWeavers,
  normalizeCode,
  quoteInNote,
  stageIndex,
  stageName,
  validateRows,
} from "./domain.ts";
import type { LogAction } from "./log-format.ts";
import type { LlmFunctionDeclaration } from "./llm-types.ts";

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

export type ProposalType = "create_hat" | "advance_stage" | "flag_issue";
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

interface SeenHat {
  hat: HatRow;
  match: "exact" | "confusable" | "fuzzy";
  heard: string;
  /** How the hat was found; hats found only by stage can't be acted on (bulk injection guard). */
  via: "code" | "weaver" | "stage" | "tag";
  grounded: boolean;
  /** For via "weaver": every hat that weaver lookup returned. More than one means "which one?". */
  group?: string[];
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
  cache: { weavers?: WeaverRow[]; hats?: HatRow[] };
}

export const MAX_PROPOSALS = 10;
const MAX_FIND_RESULTS = 20;
const STEP_FIELD_LIMIT = 4096;

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
// Tool declarations (fixed order, stable text: no dates, names or ids)
// ---------------------------------------------------------------------------

const QUOTE = {
  type: "string",
  description:
    "Exact words copied from the note that support this, 3 to 160 characters, character for character, original language.",
};
const WHY = { type: "string", description: "One plain English sentence explaining this proposal." };
const CONFIDENCE = { type: "string", enum: ["high", "check"] };
const STAGE_ENUM = { type: "string", enum: [...STAGES] };
const GRADE_ENUM = { type: "string", enum: [...GRADES] };
const FLAG_KINDS = ["grade_mismatch", "too_fast", "weaver_not_found", "other"] as const;

export const TOOLS: LlmFunctionDeclaration[] = [
  {
    name: "find_weaver",
    description:
      "Find weavers of this workshop by a name heard in the note, like 'Rosa', 'Doña Rosa' or 'Manuel Delgado'. Returns every match (0 to 5). Read only.",
    parametersJsonSchema: {
      type: "object",
      properties: { name: { type: "string", description: "Name as heard. Honorifics like Doña are fine." } },
      required: ["name"],
    },
  },
  {
    name: "find_hats",
    description:
      "Find hats of this workshop by codes, by weaver name, or by stage. Give at least one of codes, weaver_name or stage. Codes are matched exactly first, then by common mishearings. Returns up to 20 hats. Read only.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        codes: {
          type: "array",
          items: { type: "string" },
          description: "Hat codes as heard in the note, up to 10.",
        },
        weaver_name: { type: "string", description: "Weaver name as heard, for hats described by weaver." },
        stage: { ...STAGE_ENUM, description: "Only hats at this stage." },
        open_only: {
          type: "boolean",
          description: "true (default): skip Finished and archived hats. Use false only if the note is about a finished hat.",
        },
      },
    },
  },
  {
    name: "get_hat",
    description: "Get one hat with its last 10 events and open flags. Use only when you need history. Read only.",
    parametersJsonSchema: {
      type: "object",
      properties: { code: { type: "string", description: "Hat code, like TQ-7F3K2." } },
      required: ["code"],
    },
  },
  {
    name: "propose_create_hats",
    description:
      "Propose creating new hats from one weaver. Does not save anything: a person must approve. weaver_id must come from find_weaver, and find_weaver must have returned exactly one weaver for that name.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        weaver_id: { type: "string" },
        quantity: { type: "integer", description: "1 to 20" },
        grade: { ...GRADE_ENUM, description: "Only if the note says it. Code derives it from rows otherwise." },
        rows_per_inch: { type: "integer", description: "6 to 40, as said in the note (hileras)." },
        straw: { type: "string", enum: [...STRAWS], description: "Only if the note says it." },
        quote: QUOTE,
        why: WHY,
        confidence: CONFIDENCE,
      },
      required: ["weaver_id", "quantity", "rows_per_inch", "quote", "why", "confidence"],
    },
  },
  {
    name: "propose_advance_stage",
    description:
      "Propose moving one hat to the stage the note says. Does not save anything. Code rules decide if the move is allowed; blocked proposals are still shown to the person.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        hat_code: { type: "string", description: "Code exactly as returned by find_hats or get_hat." },
        to_stage: STAGE_ENUM,
        quote: QUOTE,
        why: WHY,
        confidence: CONFIDENCE,
      },
      required: ["hat_code", "to_stage", "quote", "why", "confidence"],
    },
  },
  {
    name: "propose_flag",
    description: "Propose raising a flag on one hat for a person to review. Does not save anything.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        hat_code: { type: "string", description: "Code exactly as returned by find_hats or get_hat." },
        kind: { type: "string", enum: [...FLAG_KINDS] },
        message: { type: "string", description: "Short English text for the flag, up to 200 characters." },
        quote: QUOTE,
        why: WHY,
        confidence: CONFIDENCE,
      },
      required: ["hat_code", "kind", "message", "quote", "why", "confidence"],
    },
  },
  {
    name: "ask_question",
    description:
      "Ask the person a question instead of guessing, for example which weaver or hat is meant, or a missing fact. Creates a question card with a draft of the proposal. Does not save anything.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        proposal_type: { type: "string", enum: ["create_hat", "advance_stage", "flag_issue"] },
        question: { type: "string", description: "Short English question, up to 160 characters." },
        choices: {
          type: "array",
          description: "0 to 4 choices taken from lookup results. Empty if nothing was found.",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              weaver_id: { type: "string", description: "A weaver_id returned by find_weaver." },
              hat_code: { type: "string", description: "A code returned by find_hats." },
            },
            required: ["label"],
          },
        },
        draft: {
          type: "object",
          description: "What you would propose once the person answers. Leave out unknown fields.",
          properties: {
            hat_code: { type: "string" },
            quantity: { type: "integer" },
            grade: GRADE_ENUM,
            rows_per_inch: { type: "integer" },
            to_stage: STAGE_ENUM,
            flag_kind: { type: "string", enum: [...FLAG_KINDS] },
          },
        },
        quote: QUOTE,
        why: WHY,
      },
      required: ["proposal_type", "question", "quote", "why"],
    },
  },
];

export const READ_TOOLS = new Set(["find_weaver", "find_hats", "get_hat"]);

// ---------------------------------------------------------------------------
// Argument helpers (the model's JSON is untrusted: re-check everything, D18)
// ---------------------------------------------------------------------------

type Args = Record<string, unknown>;

class ToolError extends Error {
  readonly extra: Record<string, unknown>;
  constructor(message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.extra = extra;
  }
}

function fail(message: string, extra?: Record<string, unknown>): never {
  throw new ToolError(message, extra);
}

function optStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function optInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : NaN;
}

function isGrade(v: string): v is Grade {
  return (GRADES as readonly string[]).includes(v);
}

function confidenceOf(v: unknown): "high" | "check" {
  return v === "high" ? "high" : "check";
}

function requireQuote(ctx: RunContext, quote: unknown): string {
  const q = typeof quote === "string" ? quote.trim() : "";
  const escaped = ctx.note.replaceAll("<", "&lt;");
  if (!q || !(quoteInNote(q, ctx.note) || quoteInNote(q, escaped))) {
    fail("The quote must be words copied exactly from the note.");
  }
  return q;
}

function requireWhy(why: unknown): string {
  const w = typeof why === "string" ? why.trim() : "";
  if (!w) fail("why is required: one plain English sentence.");
  return w.slice(0, 300);
}

function checkLimit(ctx: RunContext): void {
  if (ctx.proposals.length >= MAX_PROPOSALS) fail("Limit of 10 proposals per note reached. Stop and summarize.");
}

function compact(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** A code lookup is grounded when the heard code really appears in the note. */
function codeInNote(note: string, heard: string): boolean {
  let body = compact(heard);
  if (body.startsWith("TQ") && body.length === 7) body = body.slice(2);
  return body.length >= 4 && compact(note).includes(body);
}

/** A weaver lookup is grounded when a word of the name (2+ letters) starts a word of the note. */
function nameInNote(note: string, name: string): boolean {
  const n = ` ${foldText(note).replace(/[^a-z0-9 ]/g, " ")} `;
  const words = foldText(name)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .filter((w) => w.length > 1);
  return words.some((w) => n.includes(` ${w}`));
}

function nowRule(ctx: RunContext, r: Omit<RuleResultJson, "checked_at">): RuleResultJson {
  return { ...r, checked_at: ctx.now() };
}

function logRule(
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

function addProposal(ctx: RunContext, p: Omit<BufferedProposal, "temp_id">, summary: string): BufferedProposal {
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

async function workshopWeavers(ctx: RunContext): Promise<WeaverRow[]> {
  if (!ctx.cache.weavers) ctx.cache.weavers = await ctx.data.listWeavers();
  return ctx.cache.weavers;
}

async function workshopHats(ctx: RunContext): Promise<HatRow[]> {
  if (!ctx.cache.hats) ctx.cache.hats = await ctx.data.listHats();
  return ctx.cache.hats;
}

function isOpen(h: HatRow): boolean {
  return !h.archived && h.stage < 4;
}

function seenHat(ctx: RunContext, code: unknown): SeenHat | null {
  const n = typeof code === "string" ? normalizeCode(code) : null;
  if (!n) return null;
  return ctx.seenHats.get(n) ?? null;
}

function rememberHat(ctx: RunContext, entry: SeenHat): void {
  const prev = ctx.seenHats.get(entry.hat.code);
  // Keep the strongest evidence: a grounded exact match wins over weaker ones.
  if (prev) {
    const rank = (s: SeenHat) => (s.grounded ? 2 : 0) + (s.match === "exact" ? 1 : 0);
    if (rank(prev) >= rank(entry)) return;
  }
  ctx.seenHats.set(entry.hat.code, entry);
}

// ---------------------------------------------------------------------------
// Read handlers
// ---------------------------------------------------------------------------

async function findWeaver(ctx: RunContext, args: Args) {
  const name = typeof args.name === "string" ? args.name : "";
  const folded = foldText(name);
  if (folded.length < 1 || folded.length > 60) fail("name must be 1 to 60 characters.");
  const weavers = await workshopWeavers(ctx);
  const matches = matchWeavers(name, weavers);
  const hats = await workshopHats(ctx);
  for (const w of matches) {
    ctx.seenWeavers.set(w.id, w);
    const prev = ctx.weaverLookupSize.get(w.id);
    ctx.weaverLookupSize.set(w.id, Math.min(prev ?? Infinity, matches.length));
  }
  return {
    query: name,
    match_count: matches.length,
    matches: matches.map((w) => ({
      weaver_id: w.id,
      name: w.name,
      village: w.village,
      province: w.province,
      specialty: w.specialty ?? [],
      open_hats: hats.filter((h) => h.weaver_id === w.id && isOpen(h)).length,
    })),
    note:
      matches.length > 1
        ? "Several weavers match. Do not pick one: call ask_question with them as choices."
        : matches.length === 0
          ? "No weaver found. Do not create one: call ask_question with no choices."
          : undefined,
  };
}

function hatOut(h: HatRow, weavers: WeaverRow[], extra: Record<string, unknown>) {
  const w = h.weaver_id ? weavers.find((x) => x.id === h.weaver_id) : undefined;
  // Only problems visible in the record itself (grade vs rows). Timing problems such as too_fast
  // need the hat's events: get_hat reports those as anomalies.
  const issues = detectAnomalies(h, [])
    .map((a) => a.kind)
    .filter((k) => k !== "too_fast");
  return {
    code: h.code,
    ...extra,
    grade: h.grade,
    rows_per_inch: h.rows_per_inch,
    stage: stageName(h.stage),
    weaver: w ? { id: w.id, name: w.name } : null,
    owner_type: h.owner_type,
    archived: h.archived,
    record_issues: issues,
  };
}

async function findHats(ctx: RunContext, args: Args) {
  const rawCodes = Array.isArray(args.codes)
    ? args.codes.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    : typeof args.codes === "string" && args.codes.trim()
      ? [args.codes]
      : [];
  const weaverName = optStr(args.weaver_name);
  const stageArg = optStr(args.stage);
  const openOnly = args.open_only !== false;
  if (rawCodes.length === 0 && !weaverName && !stageArg) {
    fail("Give at least one filter: codes, weaver_name or stage.");
  }
  if (rawCodes.length > 10) fail("At most 10 codes per call.");
  let stageFilter: number | null = null;
  if (stageArg) {
    stageFilter = stageIndex(stageArg);
    if (stageFilter === null) fail("stage must be one of Weaving, Washing, Bleaching, Blocking, Finished.");
  }

  const hats = await workshopHats(ctx);
  const weavers = await workshopWeavers(ctx);
  const found = new Map<string, { hat: HatRow; out: Record<string, unknown> }>();
  const notFound: { input: string; candidates: string[] }[] = [];

  for (const input of rawCodes) {
    const n = normalizeCode(input);
    const exact = n ? hats.find((h) => h.code === n) : undefined;
    let hat: HatRow | undefined;
    let match: "exact" | "confusable" | "fuzzy" = "exact";
    if (exact) {
      hat = exact;
    } else {
      const open = hats.filter(isOpen);
      const m = matchCode(
        input,
        open.map((h) => h.code),
      );
      if (m.kind === "confusable" || m.kind === "fuzzy" || m.kind === "exact") {
        hat = open.find((h) => h.code === m.code);
        match = m.kind;
      } else if (m.kind === "ambiguous") {
        notFound.push({ input, candidates: m.candidates });
        continue;
      }
    }
    if (!hat || (openOnly && hat.archived)) {
      notFound.push({ input, candidates: [] });
      continue;
    }
    const grounded = codeInNote(ctx.note, input) || (ctx.hatTag !== null && hat.code === ctx.hatTag);
    rememberHat(ctx, { hat, match, heard: input, via: "code", grounded });
    found.set(hat.code, { hat, out: hatOut(hat, weavers, { matched_from: input, match }) });
  }

  if (weaverName || stageFilter !== null) {
    let pool = hats;
    if (weaverName) {
      const ws = matchWeavers(weaverName, weavers);
      const ids = new Set(ws.map((w) => w.id));
      pool = pool.filter((h) => h.weaver_id !== null && ids.has(h.weaver_id));
    }
    if (stageFilter !== null) pool = pool.filter((h) => h.stage === stageFilter);
    if (openOnly) pool = pool.filter(isOpen);
    const grounded = weaverName ? nameInNote(ctx.note, weaverName) : false;
    const group = pool.map((h) => h.code).sort();
    for (const hat of pool) {
      if (found.has(hat.code)) continue;
      rememberHat(ctx, {
        hat,
        match: "exact",
        heard: hat.code,
        via: weaverName ? "weaver" : "stage",
        grounded,
        group,
      });
      found.set(hat.code, { hat, out: hatOut(hat, weavers, { match: weaverName ? "by_weaver" : "by_stage" }) });
    }
  }

  const all = [...found.values()].sort((a, b) => a.hat.code.localeCompare(b.hat.code));
  return {
    hats: all.slice(0, MAX_FIND_RESULTS).map((x) => x.out),
    not_found: notFound,
    truncated: all.length > MAX_FIND_RESULTS,
  };
}

async function getHat(ctx: RunContext, args: Args) {
  const raw = typeof args.code === "string" ? args.code : "";
  const code = normalizeCode(raw);
  if (!code) fail("Codes look like TQ-7F3K2.");
  const hat = await ctx.data.getHatByCode(code);
  if (!hat) fail(`No hat ${code} in this workshop. Use find_hats to look for close matches.`);
  const grounded = codeInNote(ctx.note, raw) || ctx.hatTag === hat.code;
  rememberHat(ctx, { hat, match: "exact", heard: raw, via: "code", grounded });
  const events = await ctx.data.getEvents(hat.id);
  const flags = await ctx.data.getOpenFlags(hat.id);
  const weavers = await workshopWeavers(ctx);
  const sorted = [...events].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  return {
    ...hatOut(hat, weavers, { match: "exact" }),
    straw: hat.straw,
    events: sorted.slice(-10).map((e) => ({
      type: e.type,
      from_stage: e.from_stage === null ? null : stageName(e.from_stage),
      to_stage: e.to_stage === null ? null : stageName(e.to_stage),
      created_at: e.created_at,
    })),
    open_flags: flags.map((f) => ({ kind: f.kind, message: f.message })),
    anomalies: detectAnomalies(hat, events, ctx.now()),
  };
}

// ---------------------------------------------------------------------------
// Propose handlers
// ---------------------------------------------------------------------------

/** True when the hat was found only through a weaver who has several matching hats. */
function ambiguousByWeaver(seen: SeenHat): boolean {
  return seen.via === "weaver" && (seen.group?.length ?? 0) > 1;
}

function failAmbiguous(seen: SeenHat): never {
  const candidates = (seen.group ?? []).slice(0, 4);
  fail(
    `The note names a weaver, not a hat, and that weaver has ${seen.group?.length ?? 0} matching hats (${candidates.join(", ")}). ` +
      "Do not pick one or change them all: call ask_question with these hats as choices.",
    { error_code: "ambiguous_hats", candidates },
  );
}

function requireActionableHat(ctx: RunContext, code: unknown): SeenHat {
  const seen = seenHat(ctx, code);
  if (!seen) {
    const heard = typeof code === "string" ? code : "";
    fail(`Look this hat up with find_hats first and use the code it returned (call find_hats with codes ["${heard.slice(0, 20)}"]).`);
  }
  if (!seen.grounded) {
    fail(
      seen.via === "stage"
        ? "Hats found only by stage can't be changed from this note. The note must name the hat by its code or its weaver."
        : `The note does not mention ${seen.hat.code} or its weaver. Only propose changes for hats the note talks about.`,
    );
  }
  return seen;
}

function proposeCreateHats(ctx: RunContext, args: Args) {
  const quote = requireQuote(ctx, args.quote);
  const why = requireWhy(args.why);
  const weaverId = typeof args.weaver_id === "string" ? args.weaver_id : "";
  const weaver = ctx.seenWeavers.get(weaverId);
  if (!weaver) fail("Unknown weaver_id. Call find_weaver first and use an id it returned.");
  if ((ctx.weaverLookupSize.get(weaverId) ?? 1) > 1) {
    fail("find_weaver returned several weavers for that name. Do not pick one: call ask_question with them as choices.");
  }
  if (!nameInNote(ctx.note, weaver.name)) {
    fail(`The note does not mention ${weaver.name}. Only propose hats for weavers the note names.`);
  }
  const quantity = optInt(args.quantity);
  if (quantity === null || !Number.isInteger(quantity) || quantity < QUANTITY_MIN || quantity > QUANTITY_MAX) {
    fail("quantity must be between 1 and 20.");
  }
  const rows = optInt(args.rows_per_inch);
  if (rows === null) {
    fail(
      "rows_per_inch is required to create hats. If the note does not say it, call ask_question with proposal_type create_hat.",
    );
  }
  if (validateRows(rows)) fail("Rows per inch must be between 6 and 40.");
  const gradeArg = optStr(args.grade);
  if (gradeArg !== null && !isGrade(gradeArg)) fail("grade must be Standard, Fino or Superfino.");
  const straw = optStr(args.straw);
  if (straw !== null && !(STRAWS as readonly string[]).includes(straw)) {
    fail("straw must be Natural, Bleached or Dyed.");
  }
  checkLimit(ctx);
  const grade: Grade | null = gradeArg ?? gradeFor(rows);
  const dup = ctx.proposals.some(
    (p) =>
      p.type === "create_hat" &&
      p.status !== "question" &&
      p.payload.weaver_id === weaverId &&
      p.payload.rows_per_inch === rows &&
      (p.payload.grade ?? null) === grade,
  );
  if (dup) fail("This create proposal already exists in this run.");

  let status: ProposalStatus = "pending";
  let rule: RuleResultJson;
  if (grade === null || gradeMismatch(grade, rows)) {
    const message = gradeMismatchMessage(grade ?? "Standard", rows) ?? "Grade does not match rows per inch.";
    const fixGrade = gradeFor(rows);
    status = "blocked";
    rule = nowRule(ctx, {
      allowed: false,
      code: "grade_mismatch",
      message,
      fix: fixGrade ? { grade: fixGrade } : null,
      warnings: [],
    });
    logRule(ctx, "gradeMismatch", null, false, "grade_mismatch", message, { grade, rows });
  } else {
    rule = nowRule(ctx, { allowed: true, code: null, message: "Grade matches rows per inch.", fix: null, warnings: [] });
    logRule(ctx, "gradeMismatch", null, true, null, rule.message, { grade, rows });
  }

  const p = addProposal(
    ctx,
    {
      type: "create_hat",
      status,
      payload: {
        weaver_id: weaver.id,
        weaver_name: weaver.name,
        quantity,
        grade,
        rows_per_inch: rows,
        straw,
      },
      why,
      quote,
      confidence: confidenceOf(args.confidence),
      rule_result: rule,
    },
    `Create ${quantity} ${grade ?? "?"} hats, ${rows} rows/inch, weaver ${weaver.name}`,
  );
  return { proposal_id: p.temp_id, status, rule_result: rule };
}

async function proposeAdvanceStage(ctx: RunContext, args: Args) {
  const quote = requireQuote(ctx, args.quote);
  const why = requireWhy(args.why);
  const toName = typeof args.to_stage === "string" ? args.to_stage : "";
  const to = stageIndex(toName);
  if (to === null) fail("to_stage must be one of Weaving, Washing, Bleaching, Blocking, Finished.");
  const seen = requireActionableHat(ctx, args.hat_code);
  // "Todos los de Rosa pasan a lavado": a weaver name is not a hat. Several candidates -> ask.
  if (ambiguousByWeaver(seen)) failAmbiguous(seen);
  const code = seen.hat.code;
  if (ctx.proposals.some((p) => p.type === "advance_stage" && p.payload.hat_code === code)) {
    fail(`You already proposed a stage change for ${code} in this note.`);
  }
  checkLimit(ctx);
  const hat = await ctx.data.getHatByCode(code);
  if (!hat) fail(`${code} is no longer available.`);

  const r = canAdvance(hat, to, ctx.actor);
  if (!r.allowed && r.code === "same_stage") {
    logRule(ctx, "canAdvance", code, false, r.code, r.message, { from: hat.stage, to });
    fail(`${code} is already at ${stageName(hat.stage)}. Nothing to propose; mention it in the summary.`);
  }

  const warnings: string[] = [];
  const warningMessages: string[] = [];
  let status: ProposalStatus;
  let rule: RuleResultJson;
  if (!r.allowed) {
    status = "blocked";
    const fix = r.fix ? { to_stage: r.fix.to_stage, to_stage_name: STAGES[r.fix.to_stage] } : null;
    rule = nowRule(ctx, { allowed: false, code: r.code, message: r.message, fix, warnings });
    logRule(ctx, "canAdvance", code, false, r.code, r.message, { from: hat.stage, to });
  } else {
    status = "pending";
    if (hat.stage === 0 && to === 1) {
      const events = await ctx.data.getEvents(hat.id);
      const now = ctx.now();
      const simulated: HatEventLike[] = [
        ...events,
        { type: "stage_advanced", from_stage: 0, to_stage: 1, created_at: now },
      ];
      const fast = detectAnomalies(hat, simulated, now).find((a) => a.kind === "too_fast");
      if (fast) {
        warnings.push("too_fast");
        warningMessages.push(fast.message);
      }
    }
    if (await ctx.data.hasOpenProposal(hat.id)) {
      warnings.push("open_proposal_exists");
      warningMessages.push(`Another open proposal already targets ${code}.`);
    }
    rule = nowRule(ctx, {
      allowed: true,
      code: null,
      message: "Stage move allowed.",
      fix: null,
      warnings,
      warning_messages: warningMessages,
    });
    logRule(ctx, "canAdvance", code, true, null, rule.message, { from: hat.stage, to, warnings });
  }

  const nonExact = seen.match !== "exact";
  const p = addProposal(
    ctx,
    {
      type: "advance_stage",
      status,
      payload: {
        hat_id: hat.id,
        hat_code: code,
        code_heard: nonExact ? seen.heard : null,
        match: seen.match,
        from_stage: hat.stage,
        to_stage: to,
        from_stage_name: stageName(hat.stage),
        to_stage_name: STAGES[to],
        hat_version: hat.version,
        expected_version: hat.version,
      },
      why,
      quote,
      confidence: nonExact ? "check" : confidenceOf(args.confidence),
      rule_result: rule,
    },
    `${status === "blocked" ? "Move" : "Advance"} ${code} to ${STAGES[to]}`,
  );
  return { proposal_id: p.temp_id, status, rule_result: rule };
}

async function proposeFlag(ctx: RunContext, args: Args) {
  const quote = requireQuote(ctx, args.quote);
  const why = requireWhy(args.why);
  const kind = typeof args.kind === "string" ? args.kind : "";
  if (!(FLAG_KINDS as readonly string[]).includes(kind)) {
    fail("kind must be grade_mismatch, too_fast, weaver_not_found or other.");
  }
  const message = typeof args.message === "string" ? args.message.trim() : "";
  if (message.length < 1 || message.length > 200) fail("message must be 1 to 200 characters.");
  const seen = requireActionableHat(ctx, args.hat_code);
  const code = seen.hat.code;
  if (ctx.proposals.some((p) => p.type === "flag_issue" && p.payload.hat_code === code && p.payload.kind === kind)) {
    fail(`You already proposed a ${kind} flag for ${code} in this note.`);
  }
  checkLimit(ctx);
  const hat = await ctx.data.getHatByCode(code);
  if (!hat) fail(`${code} is no longer available.`);
  const flags = await ctx.data.getOpenFlags(hat.id);
  if (flags.some((f) => f.kind === kind)) fail(`${code} already has an open ${kind} flag.`);
  const events = await ctx.data.getEvents(hat.id);
  const anomalies = detectAnomalies(hat, events, ctx.now());
  const confirmed = anomalies.some((a) => a.kind === kind);
  // A hat described by its weaver can be flagged only when its own record shows the problem
  // ("el de Carmen dice superfino pero tiene 18 hileras"); otherwise ask which hat is meant.
  if (ambiguousByWeaver(seen) && !confirmed) failAmbiguous(seen);
  const warnings = confirmed ? [] : ["not_confirmed_by_record"];
  const rule = nowRule(ctx, {
    allowed: true,
    code: null,
    message: confirmed ? "The record confirms this issue." : "The record does not show this issue.",
    fix: null,
    warnings,
    confirmed_by_record: confirmed,
  });
  logRule(ctx, "detectAnomalies", code, true, null, rule.message, {
    kind,
    confirmed_by_record: confirmed,
    anomalies: anomalies.map((a) => a.kind),
  });
  const p = addProposal(
    ctx,
    {
      type: "flag_issue",
      status: "pending",
      payload: { hat_id: hat.id, hat_code: code, kind, message },
      why,
      quote,
      confidence: confirmed ? confidenceOf(args.confidence) : "check",
      rule_result: rule,
    },
    `Flag ${code}: ${kind}`,
  );
  return { proposal_id: p.temp_id, status: "pending", rule_result: rule };
}

function askQuestion(ctx: RunContext, args: Args) {
  const quote = requireQuote(ctx, args.quote);
  const why = requireWhy(args.why);
  const type = args.proposal_type;
  if (type !== "create_hat" && type !== "advance_stage" && type !== "flag_issue") {
    fail("proposal_type must be create_hat, advance_stage or flag_issue.");
  }
  const question = typeof args.question === "string" ? args.question.trim() : "";
  if (question.length < 1 || question.length > 160) fail("question must be 1 to 160 characters.");
  const rawChoices = Array.isArray(args.choices) ? args.choices : [];
  if (rawChoices.length > 4) fail("At most 4 choices.");
  const choices: { label: string; weaver_id: string | null; hat_code: string | null }[] = [];
  for (const c of rawChoices) {
    const o = (c && typeof c === "object" ? c : {}) as Args;
    const weaverId = optStr(o.weaver_id);
    const hatCodeRaw = optStr(o.hat_code);
    const weaver = weaverId ? ctx.seenWeavers.get(weaverId) : undefined;
    const hat = hatCodeRaw ? seenHat(ctx, hatCodeRaw) : null;
    if ((weaverId && !weaver) || (hatCodeRaw && !hat)) fail("Choices must come from lookup results.");
    if (!weaver && !hat) fail("Choices must come from lookup results.");
    // Labels come from records, not from the model, so a note can't plant text in a chip.
    const label = weaver ? (weaver.village ? `${weaver.name} (${weaver.village})` : weaver.name) : hat!.hat.code;
    choices.push({ label, weaver_id: weaver?.id ?? null, hat_code: hat?.hat.code ?? null });
  }

  const draft = (args.draft && typeof args.draft === "object" ? args.draft : {}) as Args;
  const quantity = optInt(draft.quantity);
  if (quantity !== null && (!Number.isInteger(quantity) || quantity < QUANTITY_MIN || quantity > QUANTITY_MAX)) {
    fail("draft.quantity must be between 1 and 20.");
  }
  const rows = optInt(draft.rows_per_inch);
  if (rows !== null && validateRows(rows)) fail("draft.rows_per_inch must be between 6 and 40.");
  const gradeArg = optStr(draft.grade);
  if (gradeArg !== null && !isGrade(gradeArg)) fail("draft.grade must be Standard, Fino or Superfino.");
  const toName = optStr(draft.to_stage);
  const to = toName ? stageIndex(toName) : null;
  if (toName && to === null) fail("draft.to_stage must be a stage name.");
  const flagKind = optStr(draft.flag_kind);
  if (flagKind && !(FLAG_KINDS as readonly string[]).includes(flagKind)) fail("draft.flag_kind is not valid.");
  const draftHat = optStr(draft.hat_code) ? seenHat(ctx, draft.hat_code) : null;
  if (optStr(draft.hat_code) && !draftHat) fail("draft.hat_code must come from lookup results.");
  checkLimit(ctx);

  const warnings: string[] = [];
  const grade: Grade | null = gradeArg ?? (rows !== null ? gradeFor(rows) : null);
  if (grade && rows !== null && gradeMismatch(grade, rows)) warnings.push("grade_mismatch");

  let payload: Record<string, unknown>;
  if (type === "create_hat") {
    payload = {
      weaver_id: null,
      weaver_name: null,
      quantity,
      grade,
      rows_per_inch: rows,
      straw: null,
      weaver_candidates: choices
        .filter((c) => c.weaver_id)
        .map((c) => {
          const w = ctx.seenWeavers.get(c.weaver_id as string)!;
          return { id: w.id, name: w.name, village: w.village };
        }),
    };
  } else if (type === "advance_stage") {
    const h = draftHat?.hat ?? null;
    payload = {
      hat_id: h?.id ?? null,
      hat_code: h?.code ?? null,
      code_heard: null,
      match: draftHat?.match ?? null,
      from_stage: h?.stage ?? null,
      to_stage: to,
      from_stage_name: h ? stageName(h.stage) : null,
      to_stage_name: to === null ? null : STAGES[to],
      hat_version: h?.version ?? null,
      expected_version: h?.version ?? null,
    };
  } else {
    const h = draftHat?.hat ?? null;
    payload = { hat_id: h?.id ?? null, hat_code: h?.code ?? null, kind: flagKind, message: null };
  }
  payload.question = { text: question, choices };

  const key = JSON.stringify({ type, question: foldText(question), choices });
  if (ctx.proposals.some((p) => p.status === "question" && (p.payload as { _key?: string })._key === key)) {
    fail("You already asked this question in this note.");
  }

  const rule = nowRule(ctx, {
    allowed: true,
    code: null,
    message: "Needs your answer before it can be approved.",
    fix: null,
    warnings,
  });
  const p = addProposal(
    ctx,
    { type, status: "question", payload, why, quote, confidence: "check", rule_result: rule },
    `Question (${type}): ${question}`,
  );
  // Internal dedupe key; removed before saving.
  Object.defineProperty(p.payload, "_key", { value: key, enumerable: false });
  return { proposal_id: p.temp_id, status: "question", choices };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const HANDLERS: Record<string, (ctx: RunContext, args: Args) => Promise<Record<string, unknown>> | Record<string, unknown>> = {
  find_weaver: findWeaver,
  find_hats: findHats,
  get_hat: getHat,
  propose_create_hats: proposeCreateHats,
  propose_advance_stage: proposeAdvanceStage,
  propose_flag: proposeFlag,
  ask_question: askQuestion,
};

export interface ToolResult {
  /** Sent back to the model as functionResponse.response. */
  response: Record<string, unknown>;
  isError: boolean;
}

function capForStep(v: unknown): unknown {
  let s: string;
  try {
    s = JSON.stringify(v);
  } catch {
    return String(v);
  }
  if (s === undefined) return null;
  return s.length > STEP_FIELD_LIMIT ? `${s.slice(0, STEP_FIELD_LIMIT)}…[truncated]` : v;
}

/** Runs one tool call. Never throws: bad calls become { ok: false, error } for the model to fix. */
export async function runTool(ctx: RunContext, name: string, rawArgs: unknown): Promise<ToolResult> {
  const t0 = Date.now();
  const args = (rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? rawArgs : {}) as Args;
  const access = READ_TOOLS.has(name) ? "read" : "write_proposed";
  ctx.toolCalls += 1;
  let response: Record<string, unknown>;
  let isError = false;
  let thrown: unknown = null;
  const handler = Object.prototype.hasOwnProperty.call(HANDLERS, name) ? HANDLERS[name] : undefined;
  if (!handler) {
    isError = true;
    response = { ok: false, error: `Unknown tool ${name}.` };
  } else {
    try {
      const out = await handler(ctx, args);
      response = { ok: true, ...out };
    } catch (e) {
      isError = true;
      if (e instanceof ToolError) {
        response = { ok: false, error: e.message, ...e.extra };
      } else {
        thrown = e;
        response = { ok: false, error: "The tool failed. Skip this event and mention it in the summary." };
      }
    }
  }
  const duration = Date.now() - t0;
  pushStep(ctx, {
    kind: "tool_call",
    name,
    tool: name,
    access,
    input: capForStep(args),
    output: capForStep(response),
    is_error: isError,
    duration_ms: duration,
  });
  const hatCode =
    typeof args.hat_code === "string"
      ? normalizeCode(args.hat_code)
      : typeof args.code === "string"
        ? normalizeCode(args.code)
        : null;
  const outStr = JSON.stringify(response);
  const logCtx: LogCtx = {
    hat_code: hatCode,
    duration_ms: duration,
    message: `${name}${isError ? " error" : ""}`,
    payload: {
      tool: name,
      access: access === "read" ? "read" : "propose",
      input: args,
      output: outStr.length > 2048 ? `${outStr.slice(0, 2048)}…[truncated]` : response,
      is_error: isError,
    },
  };
  if (thrown) ctx.logger?.error("agent.tool.call", thrown, logCtx);
  else if (isError) ctx.logger?.warn("agent.tool.call", logCtx);
  else ctx.logger?.info("agent.tool.call", logCtx);
  return { response, isError };
}

/** Proposals ready for save_agent_run (internal keys removed). */
export function proposalsForSave(ctx: RunContext): Omit<BufferedProposal, "temp_id">[] {
  return ctx.proposals.map((p) => ({
    type: p.type,
    status: p.status,
    payload: { ...p.payload },
    why: p.why,
    quote: p.quote,
    confidence: p.confidence,
    rule_result: p.rule_result,
  }));
}
