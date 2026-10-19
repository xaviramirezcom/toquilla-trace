// apply-proposals: human decisions on AI proposals (spec 04 section 6). Re-checks every rule with
// domain.ts on fresh rows, then writes through apply_proposal() (service role, one transaction per
// proposal). Idempotent: approving an approved proposal writes nothing.
import { EditError, type ProposalType, mergeEdits, validateApproval } from "../_shared/apply.ts";
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

interface Decision {
  proposal_id: string;
  action: "approve" | "reject";
  edits?: Record<string, unknown>;
}

interface Result {
  proposal_id: string;
  status: "approved" | "rejected" | "dismissed" | "blocked" | "failed";
  error?: { code: string; message: string };
  hat_codes?: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseDecisions(body: unknown): Decision[] | null {
  const list = (body as { decisions?: unknown } | null)?.decisions;
  if (!Array.isArray(list) || list.length < 1 || list.length > 50) return null;
  const seen = new Set<string>();
  const out: Decision[] = [];
  for (const d of list) {
    if (!d || typeof d !== "object") return null;
    const o = d as Record<string, unknown>;
    if (typeof o.proposal_id !== "string" || !UUID_RE.test(o.proposal_id)) return null;
    if (o.action !== "approve" && o.action !== "reject") return null;
    if (seen.has(o.proposal_id)) return null;
    if (o.edits !== undefined && o.edits !== null && (typeof o.edits !== "object" || Array.isArray(o.edits))) {
      return null;
    }
    seen.add(o.proposal_id);
    out.push({
      proposal_id: o.proposal_id,
      action: o.action,
      edits: (o.edits as Record<string, unknown> | undefined) ?? undefined,
    });
  }
  return out;
}

const SQL_ERRORS: Record<string, { status: Result["status"]; message: string }> = {
  version_conflict: { status: "failed", message: "Couldn't save this change. Someone may have updated this hat." },
  not_open: { status: "failed", message: "This proposal was already rejected." },
  not_found: { status: "failed", message: "Proposal not found." },
  weaver_not_found: { status: "blocked", message: "Pick a weaver for these hats." },
  quantity_range: { status: "blocked", message: "Quantity must be 1 to 20." },
  hat_unavailable: { status: "blocked", message: "This hat isn't an open hat in your workshop." },
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const { request_id, client_request_id } = getRequestId(req);
  const log = createLogger({ source: "edge:apply-proposals", request_id });
  try {
    if (req.method !== "POST") return errorResponse(req, 405, "invalid_request", "Use POST.", request_id);
    const user = await authenticate(req);
    if (!user) {
      log.warn("proposal.apply_failed", { message: "Unauthorized", payload: { code: "unauthorized", client_request_id } });
      return errorResponse(req, 401, "unauthorized", "Sign in again.", request_id);
    }
    log.set({ user_id: user.userId, workshop_id: user.workshopId });
    const decisions = parseDecisions(await readJson(req));
    if (!decisions) {
      log.warn("proposal.apply_failed", { message: "Invalid request body", payload: { code: "invalid_request" } });
      return errorResponse(
        req,
        400,
        "invalid_request",
        "Send 1 to 50 decisions with unique proposal ids and approve or reject.",
        request_id,
      );
    }

    const svc = serviceClient();
    const { data: rows, error: loadErr } = await svc
      .from("proposals")
      .select("id, run_id, workshop_id, type, payload, status, quote")
      .in(
        "id",
        decisions.map((d) => d.proposal_id),
      );
    if (loadErr) throw new Error(`load proposals: ${loadErr.message}`);
    const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));
    const actor = { userId: user.userId, workshopId: user.workshopId, role: user.role, email: user.email ?? undefined };
    const results: Result[] = [];

    for (const d of decisions) {
      const t0 = Date.now();
      const p = byId.get(d.proposal_id);
      // Another workshop's proposal looks exactly like a missing one (also for admins).
      if (!p || !user.workshopId || p.workshop_id !== user.workshopId) {
        results.push({ proposal_id: d.proposal_id, status: "failed", error: { code: "not_found", message: "Proposal not found." } });
        log.warn("proposal.apply_failed", { payload: { proposal_id: d.proposal_id, code: "not_found" } });
        continue;
      }
      const type = p.type as ProposalType;
      const runCtx = { run_id: p.run_id as string, hat_code: (p.payload?.hat_code as string | undefined) ?? null };
      try {
        if (d.action === "reject") {
          if (p.status === "approved") {
            results.push({
              proposal_id: p.id,
              status: "failed",
              error: { code: "already_approved", message: "This change was already approved." },
            });
            continue;
          }
          if (p.status === "rejected" || p.status === "dismissed") {
            results.push({ proposal_id: p.id, status: p.status });
            continue;
          }
          const newStatus = p.status === "blocked" ? "dismissed" : "rejected";
          const { error } = await svc
            .from("proposals")
            .update({ status: newStatus, decided_by: user.userId, decided_at: new Date().toISOString() })
            .eq("id", p.id)
            .not("status", "in", "(approved,rejected,dismissed)");
          if (error) throw new Error(error.message);
          log.info("proposal.reject", { ...runCtx, payload: { proposal_id: p.id, type, status: newStatus } });
          results.push({ proposal_id: p.id, status: newStatus });
          continue;
        }

        // approve
        if (p.status === "approved") {
          log.info("proposal.approve", {
            ...runCtx,
            duration_ms: Date.now() - t0,
            payload: { proposal_id: p.id, type, idempotent: true },
          });
          results.push({ proposal_id: p.id, status: "approved" });
          continue;
        }
        if (p.status === "rejected" || p.status === "dismissed") {
          results.push({
            proposal_id: p.id,
            status: "failed",
            error: { code: "not_open", message: "This proposal was already rejected." },
          });
          continue;
        }

        let merged: Record<string, unknown>;
        try {
          merged = mergeEdits(type, (p.payload ?? {}) as Record<string, unknown>, d.edits);
        } catch (e) {
          const key = e instanceof EditError ? e.key : "edits";
          results.push({
            proposal_id: p.id,
            status: "failed",
            error: { code: "invalid_edits", message: `This field can't be changed here: ${key}.` },
          });
          log.warn("proposal.apply_failed", { ...runCtx, payload: { proposal_id: p.id, type, code: "invalid_edits", key } });
          continue;
        }

        // Fresh context.
        let hat = null;
        let weaver = null;
        if (type === "create_hat") {
          if (typeof merged.weaver_id === "string") {
            const { data } = await svc
              .from("weavers")
              .select("id, name")
              .eq("id", merged.weaver_id)
              .eq("workshop_id", user.workshopId)
              .maybeSingle();
            weaver = data;
            if (data) merged.weaver_name = data.name;
          }
        } else {
          let q = svc
            .from("hats")
            .select("id, code, stage, archived, workshop_id, owner_type, owner_user_id, transfer_email, version")
            .eq("workshop_id", user.workshopId);
          q = merged.hat_id ? q.eq("id", String(merged.hat_id)) : q.eq("code", String(merged.hat_code ?? ""));
          const { data } = await q.maybeSingle();
          hat = data;
          if (hat && !merged.hat_id) {
            // A question card answered with a hat: the person picked it now, so use its current row.
            merged.hat_id = hat.id;
            merged.hat_code = hat.code;
            merged.from_stage = hat.stage;
            if (type === "advance_stage") merged.expected_version = hat.version;
          }
          if (hat && hat.transfer_email && hat.owner_type === "workshop" && type === "advance_stage") {
            // A pending transfer locks stage changes (same rule as advance_hat in SQL).
            hat = { ...hat, owner_type: "seller" };
          }
        }

        const r = validateApproval(type, merged, { hat, weaver }, actor);
        log[r.ok ? "info" : "warn"]("agent.rule.check", {
          ...runCtx,
          payload: { phase: "apply", proposal_id: p.id, type, ok: r.ok, ...(r.ok ? {} : { code: r.code, next_stage: r.next_stage }) },
        });
        if (!r.ok) {
          const status = r.kind === "conflict" ? "failed" : "blocked";
          await svc
            .from("proposals")
            .update({
              status,
              rule_result: {
                allowed: false,
                code: r.code,
                message: r.message,
                fix: r.next_stage !== undefined ? { to_stage: r.next_stage } : null,
                warnings: [],
                phase: "apply",
                checked_at: new Date().toISOString(),
              },
            })
            .eq("id", p.id)
            .not("status", "in", "(approved,rejected,dismissed)");
          log.warn("proposal.apply_failed", {
            ...runCtx,
            duration_ms: Date.now() - t0,
            payload: {
              proposal_id: p.id,
              type,
              code: r.code,
              expected_version: merged.expected_version ?? null,
              actual_version: hat?.version ?? null,
            },
          });
          results.push({ proposal_id: p.id, status, error: { code: r.code, message: r.message } });
          continue;
        }

        const edits = d.edits && Object.keys(d.edits).length > 0 ? d.edits : null;
        const { data: applied, error: rpcErr } = await svc.rpc("apply_proposal", {
          p_proposal_id: p.id,
          p_actor: user.userId,
          p_payload: merged,
          p_edits: edits,
          p_codes: null,
        });
        if (rpcErr) {
          const code = Object.keys(SQL_ERRORS).find((k) => rpcErr.message.includes(k)) ?? "internal";
          const mapped = SQL_ERRORS[code] ?? { status: "failed" as const, message: "Couldn't save this change." };
          if (code !== "not_open" && code !== "not_found") {
            await svc
              .from("proposals")
              .update({ status: mapped.status })
              .eq("id", p.id)
              .not("status", "in", "(approved,rejected,dismissed)");
          }
          if (code === "internal") {
            log.error("proposal.apply_failed", rpcErr, { ...runCtx, payload: { proposal_id: p.id, type, code } });
          } else {
            log.warn("proposal.apply_failed", { ...runCtx, payload: { proposal_id: p.id, type, code } });
          }
          results.push({ proposal_id: p.id, status: mapped.status, error: { code, message: mapped.message } });
          continue;
        }
        const out = (applied ?? {}) as { hat_codes?: string[]; flag_id?: string | null; idempotent?: boolean };
        const codes = Array.isArray(out.hat_codes) ? out.hat_codes : [];
        if (type === "create_hat" && !out.idempotent) {
          log.info("hat.create", {
            ...runCtx,
            hat_code: codes.length === 1 ? codes[0] : null,
            payload: {
              proposal_id: p.id,
              codes,
              grade: merged.grade,
              rows_per_inch: merged.rows_per_inch,
              weaver_id: merged.weaver_id,
            },
          });
        } else if (type === "advance_stage" && !out.idempotent) {
          log.info("hat.stage.advance", {
            ...runCtx,
            hat_code: codes[0] ?? runCtx.hat_code,
            payload: {
              proposal_id: p.id,
              from: hat?.stage ?? null,
              to: merged.to_stage,
              version: typeof hat?.version === "number" ? hat.version + 1 : null,
            },
          });
        }
        log.info("proposal.approve", {
          ...runCtx,
          hat_code: codes.length === 1 ? codes[0] : runCtx.hat_code,
          duration_ms: Date.now() - t0,
          payload: {
            proposal_id: p.id,
            type,
            edited: edits !== null,
            edits,
            hat_codes: codes,
            flag_id: out.flag_id ?? null,
            idempotent: out.idempotent === true,
          },
        });
        results.push({ proposal_id: p.id, status: "approved", hat_codes: codes });
      } catch (e) {
        log.error("proposal.apply_failed", e, {
          ...runCtx,
          duration_ms: Date.now() - t0,
          payload: { proposal_id: d.proposal_id, type, code: "internal" },
        });
        results.push({
          proposal_id: d.proposal_id,
          status: "failed",
          error: { code: "internal", message: "Couldn't save this change." },
        });
      }
    }
    return json(req, { results }, 200, request_id);
  } catch (e) {
    log.error("proposal.apply_failed", e, { message: "Unexpected failure", payload: { code: "internal" } });
    return errorResponse(req, 500, "internal", "Something went wrong. Try again.", request_id);
  } finally {
    await flushInBackground(log);
  }
});
