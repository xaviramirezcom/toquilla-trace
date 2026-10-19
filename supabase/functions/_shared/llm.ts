// Thin Gemini adapter (decision D26). The only file that imports the provider SDK.
// API verified against the published @google/genai package types (v2.27.0):
//   new GoogleGenAI({ apiKey }), ai.models.generateContent({ model, contents, config })
//   config: systemInstruction, tools[{ functionDeclarations[{ name, description, parametersJsonSchema }] }],
//           toolConfig.functionCallingConfig.mode ("AUTO"), responseMimeType + responseJsonSchema,
//           maxOutputTokens, thinkingConfig.thinkingBudget, temperature, abortSignal,
//           httpOptions { timeout (ms), retryOptions { attempts, initialDelay (s) } }
//   response: candidates[0].content / finishReason, usageMetadata, modelVersion, promptFeedback.blockReason
import { ApiError, GoogleGenAI } from "npm:@google/genai@2.27.0";
import { DEFAULT_MODEL, usageFromGemini } from "./pricing.ts";
import {
  type GenerateArgs,
  type GenerateResult,
  type LlmContent,
  LlmError,
  type LlmFunctionCall,
} from "./llm-types.ts";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (client) return client;
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new LlmError("GEMINI_API_KEY is not set.", "config");
  client = new GoogleGenAI({ apiKey });
  return client;
}

export function modelName(): string {
  return Deno.env.get("GEMINI_MODEL") || DEFAULT_MODEL;
}

export async function generate(args: GenerateArgs): Promise<GenerateResult> {
  const ai = getClient();
  const model = modelName();
  // deno-lint-ignore no-explicit-any
  const config: Record<string, any> = {
    systemInstruction: args.system,
    maxOutputTokens: args.maxOutputTokens ?? 2048,
    temperature: args.temperature ?? 0,
    httpOptions: {
      timeout: args.timeoutMs ?? 25_000,
      retryOptions: { attempts: 3, initialDelay: 0.5, maxDelay: 4 },
    },
  };
  if (args.signal) config.abortSignal = args.signal;
  if (args.tools && args.tools.length > 0) {
    config.tools = [{ functionDeclarations: args.tools }];
    config.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
  }
  if (args.jsonSchema) {
    config.responseMimeType = "application/json";
    config.responseJsonSchema = args.jsonSchema;
  }
  if (args.thinkingBudget !== undefined) config.thinkingConfig = { thinkingBudget: args.thinkingBudget };

  // deno-lint-ignore no-explicit-any
  let res: any;
  try {
    res = await ai.models.generateContent({ model, contents: args.contents, config });
  } catch (err) {
    if (args.signal?.aborted) throw new LlmError("Request aborted by the client.", "aborted");
    if (err instanceof ApiError) throw new LlmError(err.message.slice(0, 500), "api_error", err.status);
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort|timeout|timed out/i.test(msg)) throw new LlmError("Model call timed out.", "timeout");
    throw new LlmError(msg.slice(0, 500), "api_error");
  }

  const cand = res?.candidates?.[0];
  const content: LlmContent | null = cand?.content
    ? { role: "model", parts: Array.isArray(cand.content.parts) ? cand.content.parts : [] }
    : null;
  const parts = content?.parts ?? [];
  const textParts = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text as string);
  const functionCalls: LlmFunctionCall[] = parts
    .filter((p) => p.functionCall && typeof p.functionCall.name === "string")
    .map((p) => ({
      id: p.functionCall!.id,
      name: p.functionCall!.name as string,
      args: (p.functionCall!.args ?? {}) as Record<string, unknown>,
    }));

  let finishReason: string;
  if (cand?.finishReason) finishReason = String(cand.finishReason);
  else if (res?.promptFeedback?.blockReason) finishReason = `BLOCKED:${res.promptFeedback.blockReason}`;
  else finishReason = cand ? "STOP" : "NO_CANDIDATE";

  const u = usageFromGemini(res?.usageMetadata);
  return {
    text: textParts.length > 0 ? textParts.join("") : null,
    functionCalls,
    usage: { input_tokens: u.input_tokens ?? 0, output_tokens: u.output_tokens ?? 0, cached_tokens: u.cached_tokens ?? 0 },
    finishReason,
    model: typeof res?.modelVersion === "string" && res.modelVersion ? res.modelVersion : model,
    content,
    raw: { finishMessage: cand?.finishMessage ?? null, responseId: res?.responseId ?? null },
  };
}
