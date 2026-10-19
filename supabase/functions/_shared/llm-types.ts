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
