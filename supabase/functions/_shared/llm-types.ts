// Provider-neutral types for the LLM adapter (decision D26). Zero imports, so Node tests can
// import the agent loop and tool handlers that depend on these shapes.
// Shapes mirror @google/genai (verified against the published package types, v2.27.0):
// Content { role, parts }, Part { text, functionCall, functionResponse, thought, thoughtSignature }.

export interface LlmFunctionCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface LlmPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { id?: string; name?: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name?: string; response?: Record<string, unknown> };
}

export interface LlmContent {
  role: "user" | "model";
  parts: LlmPart[];
}

export interface LlmFunctionDeclaration {
  name: string;
  description: string;
  /** JSON Schema subset (type, enum, anyOf, items, properties, required, additionalProperties...). */
  parametersJsonSchema: Record<string, unknown>;
}

export interface LlmUsage {
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
}

export interface GenerateArgs {
  system: string;
  contents: LlmContent[];
  tools?: LlmFunctionDeclaration[];
  /** When set, the response is JSON (responseMimeType application/json + responseJsonSchema). */
  jsonSchema?: Record<string, unknown>;
  maxOutputTokens?: number;
  /** 0 turns thinking off (Flash-Lite default is already off). Omit to keep the model default. */
  thinkingBudget?: number;
  temperature?: number;
  timeoutMs?: number;
  /** Epoch ms when the whole run must be over. Every attempt (and the one retry) fits before it. */
  deadlineAt?: number;
  signal?: AbortSignal;
}

export interface GenerateResult {
  text: string | null;
  functionCalls: LlmFunctionCall[];
  usage: LlmUsage;
  /** candidates[0].finishReason, or "BLOCKED:<reason>" when the prompt itself was blocked, or "NO_CANDIDATE". */
  finishReason: string;
  model: string;
  /** The model turn exactly as returned (keeps thought signatures), to append to the history. */
  content: LlmContent | null;
  raw?: unknown;
}

export type GenerateFn = (args: GenerateArgs) => Promise<GenerateResult>;

/** Finish reasons treated like a refusal (nothing saved, agent-failed card). */
export const REFUSAL_FINISH_REASONS = new Set([
  "SAFETY",
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
  "LANGUAGE",
  "IMAGE_SAFETY",
]);

export function isRefusal(finishReason: string): boolean {
  return REFUSAL_FINISH_REASONS.has(finishReason) || finishReason.startsWith("BLOCKED:");
}

/** Error thrown by the adapter, with a coarse type for logs and HTTP mapping. */
export class LlmError extends Error {
  constructor(
    message: string,
    public readonly type: "timeout" | "aborted" | "api_error" | "config",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/** HTTP statuses worth one retry: rate limit and server-side errors. */
export const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
export const MIN_ATTEMPT_MS = 1500;
export const RETRY_DELAY_MS = 500;

export interface RetryOptions {
  /** Per-attempt timeout before the deadline is applied. */
  timeoutMs: number;
  deadlineAt?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}

/**
 * Runs one model call with at most one retry, and only on 429 or 5xx. Each attempt gets
 * min(timeoutMs, time left before deadlineAt); no attempt starts with less than 1.5 s left, so
 * retries can never push a run past its budget. `attempt` must throw LlmError.
 */
export async function callWithRetry<T>(attempt: (timeoutMs: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const left = () => (opts.deadlineAt === undefined ? Infinity : opts.deadlineAt - now());
  for (let i = 1; ; i++) {
    const remaining = left();
    if (remaining < MIN_ATTEMPT_MS) throw new LlmError("Run budget exhausted before the model call.", "timeout");
    try {
      return await attempt(Math.floor(Math.min(opts.timeoutMs, remaining)));
    } catch (err) {
      const retryable =
        err instanceof LlmError && err.type === "api_error" && err.status !== undefined && RETRY_STATUSES.has(err.status);
      if (i >= 2 || !retryable || opts.signal?.aborted || left() - RETRY_DELAY_MS < MIN_ATTEMPT_MS) throw err;
      await sleep(RETRY_DELAY_MS);
    }
  }
}
