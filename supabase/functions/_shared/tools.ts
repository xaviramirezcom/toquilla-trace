// Workshop agent tools (spec 03 section 6.6, D18, D26). This file is the entry point: it runs one
// tool call and re-exports the parts, so callers import only "./tools.ts".
//   tools/context.ts  data shapes, RunContext, shared helpers
//   tools/schemas.ts  function declarations sent to Gemini
//   tools/read.ts     find_weaver, find_hats, get_hat
//   tools/propose.ts  propose_create_hats, propose_advance_stage, propose_flag, ask_question
// Handlers never write records. Only relative imports of zero-import files (Deno, Next.js, Vitest).
import { normalizeCode } from "./domain.ts";

/** Tool output kept in a log row (the agent_runs step keeps up to STEP_FIELD_LIMIT). */
const LOG_OUTPUT_LIMIT = 2048;
import {
  type Args,
  type BufferedProposal,
  type LogCtx,
  type RunContext,
  STEP_FIELD_LIMIT,
  ToolError,
  pushStep,
} from "./tools/context.ts";
import { askQuestion, proposeAdvanceStage, proposeCreateHats, proposeFlag } from "./tools/propose.ts";
import { findHats, findWeaver, getHat } from "./tools/read.ts";
import { READ_TOOLS } from "./tools/schemas.ts";

export {
  type AgentStep,
  type BufferedProposal,
  type DataLayer,
  type HatRow,
  MAX_PROPOSALS,
  type ProposalStatus,
  type ProposalType,
  type RuleResultJson,
  type RunContext,
  type StepInput,
  type ToolLogger,
  type WeaverRow,
  createRunContext,
  preloadHatTag,
  pushStep,
} from "./tools/context.ts";
export { READ_TOOLS, TOOLS } from "./tools/schemas.ts";

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
      output: outStr.length > LOG_OUTPUT_LIMIT ? `${outStr.slice(0, LOG_OUTPUT_LIMIT)}…[truncated]` : response,
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
