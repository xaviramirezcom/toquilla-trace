// concierge: public, read-only Q&A about one hat (spec 07, D26). No tools. The record comes from
// public_hat_passport called with the anon key, so the model sees exactly what a visitor sees.
import {
  ANSWER_SCHEMA,
  COPY,
  type PassportJson,
  SYSTEM_PROMPT,
  buildUserContent,
  conciergeRunRow,
  finalizeAnswer,
  guessLang,
  parseModelOut,
  toConciergeRecord,
  validateRequest,
} from "../_shared/concierge.ts";
import { anonClient, errorResponse, getRequestId, json, preflight, readJson, serviceClient } from "../_shared/http.ts";
import { createLogger, flushInBackground } from "../_shared/log.ts";
import { generate, modelName } from "../_shared/llm.ts";
import { costUsd } from "../_shared/pricing.ts";
import { LlmError, isRefusal } from "../_shared/llm-types.ts";

const PER_MINUTE = 5;
const PER_DAY = 60;
const DAILY_MAX = Number(Deno.env.get("CONCIERGE_DAILY_MAX") ?? "500") || 500;

async function ipHash(req: Request): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  // RATE_SALT if set; otherwise a server secret that is never logged, so hashes can't be reversed.
  const salt = Deno.env.get("RATE_SALT") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}|${salt}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

async function countAnswers(sinceIso: string, hash?: string): Promise<number> {
  let q = serviceClient()
    .from("app_logs")
    .select("id", { count: "exact", head: true })
    .eq("source", "edge:concierge")
    .in("action", ["concierge.message", "concierge.refused"])
    .gte("created_at", sinceIso);
  if (hash) q = q.eq("payload->>ip_hash", hash);
  const { count, error } = await q;
  if (error) return 0; // fail open: limits depend on logs (spec 07 open question 7)
  return count ?? 0;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const { request_id } = getRequestId(req);
  const log = createLogger({ source: "edge:concierge", request_id });
  const started = Date.now();
  let hash = "unknown";
  let turn = 0;
  /** Set once the hat is loaded: from then on every outcome writes one agent_runs row. */
  let runHat: string | null = null;

  const saveRun = async (row: Parameters<typeof conciergeRunRow>[0]) => {
    try {
      const { error } = await serviceClient().from("agent_runs").insert(conciergeRunRow(row));
      if (error) console.warn(`[concierge] run insert failed: ${error.message}`);
    } catch {
      // never break the answer because of the run row
    }
  };

  const fail = async (status: number, code: string, message: string, level: "warn" | "error" = "warn", err?: unknown) => {
    const c = { message, duration_ms: Date.now() - started, payload: { code, ip_hash: hash, turn, latency_ms: Date.now() - started } };
    if (level === "error") log.error("concierge.error", err ?? new Error(message), c);
    else log.warn("concierge.error", c);
    if (runHat) {
      await saveRun({
        request_id,
        hat_code: runHat,
        status: "failed",
        model: modelName(),
        latency_ms: Date.now() - started,
        error: { code, message: err instanceof Error ? err.message : message },
      });
    }
    return errorResponse(req, status, code, message, request_id);
  };

  try {
    if (req.method !== "POST") return fail(405, "invalid_request", "Use POST.");
    hash = await ipHash(req);
    const v = validateRequest(await readJson(req));
    turn = v.turn;
    if (!v.ok) {
      return fail(v.code === "rate_limited" ? 429 : 400, v.code, v.message);
    }
    log.set({ hat_code: v.code });

    const now = Date.now();
    const [perMinute, perDay, global] = await Promise.all([
      countAnswers(new Date(now - 60_000).toISOString(), hash),
      countAnswers(new Date(now - 86_400_000).toISOString(), hash),
      countAnswers(new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString()),
    ]);
    if (perMinute >= PER_MINUTE || perDay >= PER_DAY) {
      return fail(429, "rate_limited", "You've asked a lot of questions. Try again in a minute.");
    }
    if (global >= DAILY_MAX) {
      return fail(503, "concierge_paused", "The concierge is resting for today. Try again tomorrow.");
    }

    const { data: passport, error: rpcErr } = await anonClient().rpc("public_hat_passport", { p_code: v.code });
    if (rpcErr) return fail(502, "model_error", "Couldn't load this hat's record.", "error", rpcErr);
    if (!passport) return fail(404, "hat_not_found", "This code isn't in our records.");

    const record = toConciergeRecord(passport as PassportJson);
    const content = buildUserContent(record, v.messages.slice(0, -1), v.question);
    runHat = v.code;

    let res;
    try {
      res = await generate({
        system: SYSTEM_PROMPT,
        contents: [{ role: "user", parts: [{ text: content }] }],
        jsonSchema: ANSWER_SCHEMA as unknown as Record<string, unknown>,
        maxOutputTokens: 800,
        thinkingBudget: 0,
        temperature: 0.2,
        timeoutMs: 20_000,
        deadlineAt: started + 25_000,
      });
    } catch (e) {
      const timeout = e instanceof LlmError && e.type === "timeout";
      return fail(502, "model_error", timeout ? "The concierge took too long. Try again." : "I couldn't answer that. Try again.", "error", e);
    }

    const latency = Date.now() - started;
    const base = {
      question: v.question,
      turn,
      ip_hash: hash,
      model: res.model,
      tokens_in: res.usage.input_tokens,
      tokens_out: res.usage.output_tokens,
      cache_read: res.usage.cached_tokens,
      cost_usd: costUsd(res.usage),
      latency_ms: latency,
      finish_reason: res.finishReason,
    };

    const runBase = {
      request_id,
      hat_code: v.code,
      model: res.model,
      tokens_in: res.usage.input_tokens,
      tokens_out: res.usage.output_tokens,
      latency_ms: latency,
      cost_usd: base.cost_usd,
    };

    if (isRefusal(res.finishReason) || res.finishReason === "NO_CANDIDATE") {
      const lang = guessLang(v.question);
      await saveRun({ ...runBase, status: "refused", summary: "refused (model refusal)" });
      log.info("concierge.refused", {
        message: "Model refusal",
        duration_ms: latency,
        payload: { ...base, answer_kind: "unknown", sources: [], lang, reason: "model_refusal" },
      });
      return json(req, { answer: COPY.unknown[lang], sources: [] }, 200, request_id);
    }
    if (res.finishReason === "MAX_TOKENS") {
      return fail(502, "model_error", "I couldn't answer that. Try again.", "error", new Error("max_tokens"));
    }
    const out = parseModelOut(res.text);
    if (!out) return fail(502, "model_error", "I couldn't answer that. Try again.", "error", new Error("unparseable model output"));

    const final = finalizeAnswer(out, record);
    const sourcesLog = final.sources.map((s) => (s.kind === "general" ? "care_guide" : s.field));
    const payload = {
      ...base,
      answer_kind: final.kind,
      model_kind: out.kind,
      sources: sourcesLog,
      dropped_sources: out.sources.length - final.sources.length,
      lang: final.lang,
    };
    const refusedKind = final.kind === "change_request" || final.kind === "leak_guard";
    await saveRun({
      ...runBase,
      status: refusedKind ? "refused" : "answered",
      summary: `${refusedKind ? "refused" : "answered"} (${final.kind})`,
    });
    if (refusedKind) {
      log.info("concierge.refused", {
        message: final.kind === "leak_guard" ? "Leak guard replaced the answer" : "Change request refused",
        duration_ms: latency,
        payload: { ...payload, reason: final.kind },
      });
    } else {
      log.info("concierge.message", { message: `Answered (${final.kind})`, duration_ms: latency, payload });
    }

    const body: Record<string, unknown> = { answer: final.answer, sources: final.sources };
    if (final.refused) body.refused = true;
    return json(req, body, 200, request_id);
  } catch (e) {
    return fail(500, "internal", "I couldn't answer that. Try again.", "error", e);
  } finally {
    await flushInBackground(log);
  }
});
