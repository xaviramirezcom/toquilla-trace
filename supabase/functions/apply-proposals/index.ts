// apply-proposals: human decisions on AI proposals (spec 04 section 6). Re-checks every rule with
// domain.ts on fresh rows, then writes through apply_proposal() (service role, one transaction per
// proposal). Idempotent: approving an approved proposal writes nothing.
import { type ApplyData, type ProposalRow, type Result, decideOne, parseDecisions } from "../_shared/apply.ts";
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

const TERMINAL = "(approved,rejected,dismissed)";

/** The service role data layer for decideOne (_shared/apply.ts). Every hat read is workshop scoped. */
function serviceData(): ApplyData {
  const svc = serviceClient();
  return {
    async updateOpenProposal(id, patch) {
      const { error } = await svc.from("proposals").update(patch).eq("id", id).not("status", "in", TERMINAL);
      return error ? error.message : null;
    },
    async findWeaver(id, workshopId) {
      const { data } = await svc.from("weavers").select("id, name").eq("id", id).eq("workshop_id", workshopId).maybeSingle();
      return data;
    },
    async findHat(workshopId, by) {
      const q = svc
        .from("hats")
        .select("id, code, stage, archived, workshop_id, owner_type, owner_user_id, transfer_email, version")
        .eq("workshop_id", workshopId);
      const { data } = await ("id" in by ? q.eq("id", by.id) : q.eq("code", by.code)).maybeSingle();
      return data;
    },
    async applyProposal(args) {
      const { data, error } = await svc.rpc("apply_proposal", args);
      return { data, error };
    },
  };
}

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

    const { data: rows, error: loadErr } = await serviceClient()
      .from("proposals")
      .select("id, run_id, workshop_id, type, payload, status")
      .in(
        "id",
        decisions.map((d) => d.proposal_id),
      );
    if (loadErr) throw new Error(`load proposals: ${loadErr.message}`);
    const byId = new Map(((rows ?? []) as ProposalRow[]).map((r) => [r.id, r]));
    const deps = {
      data: serviceData(),
      log,
      actor: { userId: user.userId, workshopId: user.workshopId, role: user.role, email: user.email ?? undefined },
    };
    const results: Result[] = [];
    // Sequential on purpose: each decision is its own transaction and the order is the user's order.
    for (const d of decisions) results.push(await decideOne(deps, d, byId.get(d.proposal_id)));
    return json(req, { results }, 200, request_id);
  } catch (e) {
    log.error("proposal.apply_failed", e, { message: "Unexpected failure", payload: { code: "internal" } });
    return errorResponse(req, 500, "internal", "Something went wrong. Try again.", request_id);
  } finally {
    await flushInBackground(log);
  }
});
