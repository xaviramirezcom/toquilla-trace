// Workshop agent tools, part 4: propose handlers. They never write records: after the domain.ts rule
// checks they only buffer a proposal in the RunContext for a person to review.
import {
  type Grade,
  type HatEventLike,
  STAGES,
  STRAWS,
  canAdvance,
  detectAnomalies,
  foldText,
  gradeFor,
  gradeMismatch,
  gradeMismatchMessage,
  stageIndex,
  stageName,
  validateHatFields,
} from "../domain.ts";
import {
  type Args,
  type ProposalStatus,
  type RuleResultJson,
  type RunContext,
  type SeenHat,
  addProposal,
  pushStep,
  checkLimit,
  codeInNote,
  confidenceOf,
  fail,
  isGrade,
  logRule,
  nameInNote,
  nowRule,
  optInt,
  optStr,
  requireQuote,
  requireWhy,
  seenHat,
} from "./context.ts";
import { findHats } from "./read.ts";
import { FLAG_KINDS } from "./schemas.ts";

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

/**
 * The hat a propose call targets, if the run may act on it. AI-5: when the model proposes before
 * looking up a code that really appears in the note, code runs that exact lookup itself (same
 * grounding as find_hats) and checks once more, instead of refusing and hoping the model retries.
 */
async function requireActionableHat(ctx: RunContext, code: unknown): Promise<SeenHat> {
  const heard = typeof code === "string" ? code : "";
  let seen = seenHat(ctx, code);
  if (!seen && heard && codeInNote(ctx.note, heard)) {
    await autoLookup(ctx, heard);
    seen = seenHat(ctx, code);
  }
  if (!seen) {
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

/** find_hats run by code (not by the model), recorded as a tool call so the trace shows it. */
async function autoLookup(ctx: RunContext, heard: string): Promise<void> {
  const t0 = Date.now();
  const input = { codes: [heard], auto_lookup: true };
  const output = await findHats(ctx, { codes: [heard] });
  ctx.toolCalls += 1;
  pushStep(ctx, {
    kind: "tool_call",
    name: "find_hats",
    tool: "find_hats",
    access: "read",
    input,
    output: { ok: true, ...output },
    is_error: false,
    duration_ms: Date.now() - t0,
  });
  ctx.logger?.info("agent.tool.call", {
    message: "find_hats (automatic lookup before a proposal)",
    duration_ms: Date.now() - t0,
    payload: { tool: "find_hats", access: "read", input, is_error: false },
  });
}

/**
 * AI-9: the quote must be about this hat, not any words of the note. When the note writes the code,
 * the quote must contain it; when the hat was found by weaver, the quote must contain a word of the
 * name used in that lookup. A hat known only from the user's tag needs neither.
 */
function requireQuoteAboutHat(ctx: RunContext, quote: string, seen: SeenHat): void {
  if (codeInNote(ctx.note, seen.heard)) {
    if (!codeInNote(quote, seen.heard)) {
      fail(`The quote must include the hat code as written in the note (${seen.heard}), with the words about it.`);
    }
    return;
  }
  if (seen.via === "weaver" && seen.weaverQuery && !nameInNote(quote, seen.weaverQuery)) {
    fail(`The quote must include the weaver's name as written in the note (${seen.weaverQuery}), with the words about the hat.`);
  }
}

export function proposeCreateHats(ctx: RunContext, args: Args) {
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
  const rows = optInt(args.rows_per_inch);
  if (rows === null) {
    fail(
      "rows_per_inch is required to create hats. If the note does not say it, call ask_question with proposal_type create_hat.",
    );
  }
  // Same field rules as the forms and apply-proposals (domain.validateHatFields).
  const fieldErrors = validateHatFields({ quantity: quantity ?? NaN, rows_per_inch: rows });
  if (fieldErrors.quantity) fail(fieldErrors.quantity);
  if (fieldErrors.rows_per_inch) fail(fieldErrors.rows_per_inch);
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

export async function proposeAdvanceStage(ctx: RunContext, args: Args) {
  const quote = requireQuote(ctx, args.quote);
  const why = requireWhy(args.why);
  const toName = typeof args.to_stage === "string" ? args.to_stage : "";
  const to = stageIndex(toName);
  if (to === null) fail("to_stage must be one of Weaving, Washing, Bleaching, Blocking, Finished.");
  const seen = await requireActionableHat(ctx, args.hat_code);
  requireQuoteAboutHat(ctx, quote, seen);
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

export async function proposeFlag(ctx: RunContext, args: Args) {
  const quote = requireQuote(ctx, args.quote);
  const why = requireWhy(args.why);
  const kind = typeof args.kind === "string" ? args.kind : "";
  if (!(FLAG_KINDS as readonly string[]).includes(kind)) {
    fail("kind must be grade_mismatch, too_fast, weaver_not_found or other.");
  }
  const message = typeof args.message === "string" ? args.message.trim() : "";
  if (message.length < 1 || message.length > 200) fail("message must be 1 to 200 characters.");
  const seen = await requireActionableHat(ctx, args.hat_code);
  requireQuoteAboutHat(ctx, quote, seen);
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

export function askQuestion(ctx: RunContext, args: Args) {
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
  const rows = optInt(draft.rows_per_inch);
  const draftErrors = validateHatFields({ quantity: quantity ?? undefined, rows_per_inch: rows ?? undefined });
  if (draftErrors.quantity) fail(`draft: ${draftErrors.quantity}`);
  if (draftErrors.rows_per_inch) fail(`draft: ${draftErrors.rows_per_inch}`);
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
