// workshop-agent: one workshop note in, reviewed proposals out (spec 03, D8, D26).
// Nothing here writes hats, weavers, hat_events or hat_flags. Only agent_runs (service role),
// proposals (through save_agent_run) and app_logs.
import { isValidCode, normalizeCode } from "../_shared/domain.ts";
import {
  authenticate,
  errorResponse,
  getRequestId,
  json,
  preflight,
  readJson,
  serviceClient,
} from "../_shared/http.ts";
import { createLogger, flushInBackground } from "../_shared/log.ts";
import { generate, modelName } from "../_shared/llm.ts";
import { type LoopOutcome, runAgentLoop } from "../_shared/agent.ts";
import { supabaseDataLayer } from "../_shared/db.ts";
import { createRunContext, preloadHatTag, proposalsForSave, pushStep } from "../_shared/tools.ts";

const RATE_LIMIT_PER_HOUR = 20;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const { request_id, client_request_id } = getRequestId(req);
  const log = createLogger({ source: "edge:workshop-agent", request_id });
  const started = Date.now();
  let runId: string | null = null;

  const validationError = (status: number, code: string, message: string, phase: string) => {
    log.warn("agent.run.error", {
      message,
      payload: { phase, error_type: code, status_code: status, client_request_id },
    });
    return errorResponse(req, status, code, message, request_id);
  };

  try {
    if (req.method !== "POST") return validationError(405, "invalid_input", "Use POST.", "validate");

    const user = await authenticate(req);
    if (!user) return validationError(401, "unauthorized", "Sign in again to use the assistant.", "auth");
    log.set({ user_id: user.userId, workshop_id: user.workshopId });
    if (!user.workshopId) {
      return validationError(403, "no_workshop", "Your account is not linked to a workshop.", "auth");
    }

    const body = (await readJson(req)) as Record<string, unknown> | null;
    const note = typeof body?.note === "string" ? body.note.trim() : "";
    if (note.length < 1 || note.length > 1000) {
      return validationError(400, "invalid_input", "The note must be 1 to 1000 characters.", "validate");
    }
    const inputMode = body?.input_mode;
    if (inputMode !== "voice" && inputMode !== "typed") {
      return validationError(400, "invalid_input", "input_mode must be voice or typed.", "validate");
    }
    let hatTag: string | null = null;
    if (body?.hat_tag !== undefined && body?.hat_tag !== null && body?.hat_tag !== "") {
      hatTag = typeof body.hat_tag === "string" ? normalizeCode(body.hat_tag) : null;
      if (!hatTag || !isValidCode(hatTag)) {
        return validationError(400, "invalid_input", "hat_tag must look like TQ-7F3K2.", "validate");
      }
    }

    const svc = serviceClient();
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count, error: countErr } = await svc
      .from("agent_runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.userId)
      .eq("agent", "workshop")
      .gte("created_at", since);
    if (countErr) throw new Error(`rate limit query: ${countErr.message}`);
    if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
      return validationError(429, "rate_limited", "You've sent a lot of notes. Try again later.", "validate");
    }

    const model = modelName();
    const { data: run, error: runErr } = await svc
      .from("agent_runs")
      .insert({
        agent: "workshop",
        user_id: user.userId,
        workshop_id: user.workshopId,
        hat_code: hatTag,
        input: note,
        input_mode: inputMode,
        status: "running",
        request_id,
        model,
      })
      .select("id")
      .single();
    if (runErr || !run) throw new Error(`run insert: ${runErr?.message ?? "no row"}`);
    runId = run.id as string;
    log.set({ run_id: runId, hat_code: hatTag });
    log.info("agent.run.start", {
      message: "Agent run started",
      payload: { note, note_len: note.length, input_mode: inputMode, hat_tag: hatTag, model, client_request_id },
    });

    const ctx = createRunContext({
      note,
      hatTag,
      actor: { userId: user.userId, workshopId: user.workshopId, role: user.role, email: user.email ?? undefined },
      data: supabaseDataLayer(user.client, user.workshopId),
      logger: log,
    });
    if (hatTag && !(await preloadHatTag(ctx))) {
      log.warn("agent.run.start", { message: `Tagged hat ${hatTag} not found in this workshop; ignoring the tag.` });
      ctx.hatTag = null;
    }

    let loopOutcome: LoopOutcome;
    try {
      loopOutcome = await runAgentLoop(ctx, { generate, inputMode, model, signal: req.signal });
    } catch (e) {
      // runAgentLoop never throws by design; this is a last resort.
      const message = e instanceof Error ? e.message : String(e);
      pushStep(ctx, { kind: "error", code: "internal", message, error: { type: "internal", message } });
      loopOutcome = {
        status: "failed",
        error: { type: "internal", message },
        totals: {
          iterations: 0,
          model_calls: 0,
          tokens_in: 0,
          tokens_out: 0,
          cached_tokens: 0,
          cost_usd: 0,
          model,
        },
      };
    }

    const outcome = loopOutcome;
    const latency = Date.now() - started;
    const t = outcome.totals;
    const ok = outcome.status === "proposed";
    const toSave = ok ? proposalsForSave(ctx).map((p, i) => ({ ...p, temp_id: ctx.proposals[i].temp_id })) : [];
    const summary =
      outcome.status === "proposed"
      ? outcome.summary
      : outcome.status === "stopped"
        ? "Stopped before finishing. Nothing was prepared."
        : "The assistant could not finish. Nothing was prepared.";
    const { data: saved, error: saveErr } = await svc.rpc("save_agent_run", {
      p_run_id: runId,
      p_status: outcome.status,
      p_summary: summary,
      p_steps: ctx.steps,
      p_proposals: toSave,
      p_tokens_in: t.tokens_in,
      p_tokens_out: t.tokens_out,
      p_latency_ms: latency,
      p_cost_usd: t.cost_usd,
      p_model: t.model,
      p_error: outcome.status === "proposed" ? null : outcome.error,
    });
    if (saveErr) {
      log.error("agent.run.error", saveErr, {
        message: "save_agent_run failed",
        duration_ms: latency,
        payload: { phase: "save", error_type: "save_failed" },
      });
      await svc
        .from("agent_runs")
        .update({ status: "failed", error: { type: "save_failed", message: saveErr.message }, latency_ms: latency })
        .eq("id", runId);
      return errorResponse(req, 500, "internal", "Couldn't save the assistant's proposals. Try again.", request_id, {
        run_id: runId,
      });
    }

    const byStatus = { pending: 0, question: 0, blocked: 0 };
    for (const p of ctx.proposals) byStatus[p.status] += 1;
    const endPayload = {
      status: outcome.status,
      iterations: t.iterations,
      model_calls: t.model_calls,
      tool_calls: ctx.toolCalls,
      proposals_by_status: byStatus,
      tokens_in: t.tokens_in,
      tokens_out: t.tokens_out,
      cost_usd: t.cost_usd,
      model: t.model,
    };

    if (outcome.status === "failed") {
      log.error("agent.run.error", outcome.error, {
        message: `Agent run failed: ${outcome.error.type}`,
        duration_ms: latency,
        payload: {
          phase: "model",
          error_type: outcome.error.type,
          status_code: outcome.error.status ?? null,
          stop_reason: outcome.error.finish_reason ?? null,
          ...endPayload,
        },
      });
      const timeout = outcome.error.type === "timeout";
      return errorResponse(
        req,
        timeout ? 504 : 502,
        timeout ? "timeout" : "model_error",
        timeout ? "The assistant took too long. Try again." : "The assistant couldn't finish this note. Try again.",
        request_id,
        { run_id: runId },
      );
    }
    if (outcome.status !== "proposed") {
      log.info("agent.run.end", { message: "Agent run stopped", duration_ms: latency, payload: endPayload });
      return errorResponse(req, 499, "stopped", "Stopped.", request_id, { run_id: runId });
    }

    const warn = outcome.usedFallback || latency > 25_000 || t.cost_usd > 0.15 || t.model_calls > 5;
    const endCtx = {
      message: outcome.usedFallback ? "Agent run ended with the fallback summary" : "Agent run ended",
      duration_ms: latency,
      payload: { ...endPayload, used_fallback_summary: outcome.usedFallback },
    };
    if (warn) log.warn("agent.run.end", endCtx);
    else log.info("agent.run.end", endCtx);

    const ids = (Array.isArray(saved) ? saved : []) as { id: string; temp_id: string }[];
    const idFor = new Map(ids.map((r) => [r.temp_id, r.id]));
    const proposals = ctx.proposals.map((p) => ({
      id: idFor.get(p.temp_id) ?? null,
      type: p.type,
      status: p.status,
      payload: { ...p.payload },
      why: p.why,
      quote: p.quote,
      confidence: p.confidence,
      rule_result: p.rule_result,
    }));
    const res: Record<string, unknown> = { run_id: runId, summary: outcome.summary, proposals };
    if (user.role === "admin") {
      // D8: tokens and cost only for admins, decided on the server.
      res.meta = {
        tool_calls: ctx.toolCalls,
        model_calls: t.model_calls,
        latency_ms: latency,
        tokens_in: t.tokens_in,
        tokens_out: t.tokens_out,
        cost_usd: t.cost_usd,
        model: t.model,
      };
    }
    return json(req, res, 200, request_id);
  } catch (e) {
    const latency = Date.now() - started;
    log.error("agent.run.error", e, {
      message: "Unexpected failure",
      duration_ms: latency,
      payload: { phase: "internal", error_type: "internal" },
    });
    if (runId) {
      try {
        await serviceClient()
          .from("agent_runs")
          .update({
            status: "failed",
            latency_ms: latency,
            error: { type: "internal", message: e instanceof Error ? e.message.slice(0, 500) : String(e) },
          })
          .eq("id", runId)
          .eq("status", "running");
      } catch {
        // already logged
      }
    }
    return errorResponse(req, 500, "internal", "Something went wrong. Try again.", request_id, runId ? { run_id: runId } : {});
  } finally {
    await flushInBackground(log);
  }
});
