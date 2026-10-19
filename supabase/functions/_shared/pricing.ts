// LLM cost per call. Zero imports (decision D23). Prices per decision D26 (Gemini 2.5 Flash-Lite),
// USD per million tokens. Verify on the Gemini pricing page before quoting numbers.

export const DEFAULT_MODEL = "gemini-2.5-flash-lite";

export const PRICE_PER_MILLION = {
  input: 0.1,
  output: 0.4,
} as const;

/** Provider-neutral usage, as stored in agent_runs (tokens_in / tokens_out). */
export interface UsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
}

/** Shape of Gemini's `response.usageMetadata` (only the fields we read). */
export interface GeminiUsageMetadata {
  promptTokenCount?: number | null;
  candidatesTokenCount?: number | null;
  thoughtsTokenCount?: number | null;
  cachedContentTokenCount?: number | null;
}

function n(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Gemini usage to neutral usage. promptTokenCount already includes cached tokens, which are
 * counted at the full input price (overestimates, never underestimates). Thinking tokens are
 * billed as output.
 */
export function usageFromGemini(meta: GeminiUsageMetadata | null | undefined): Required<UsageLike> & {
  cached_tokens: number;
} {
  return {
    input_tokens: n(meta?.promptTokenCount),
    output_tokens: n(meta?.candidatesTokenCount) + n(meta?.thoughtsTokenCount),
    cached_tokens: n(meta?.cachedContentTokenCount),
  };
}

/** Cost in USD, rounded to 6 decimals (the storage precision). Missing fields count as 0. */
export function costUsd(usage: UsageLike): number {
  const raw = n(usage.input_tokens) * PRICE_PER_MILLION.input + n(usage.output_tokens) * PRICE_PER_MILLION.output;
  return Number((raw / 1_000_000).toFixed(6));
}

/** "$0.0123" style for the UI (4 decimals, "n/a" when unknown). Tiny costs show 6 decimals. */
export function formatUsd(cost: number | null | undefined): string {
  if (cost === null || cost === undefined || !Number.isFinite(cost)) return "n/a";
  if (cost > 0 && cost < 0.0001) return `$${cost.toFixed(6)}`;
  return `$${cost.toFixed(4)}`;
}
