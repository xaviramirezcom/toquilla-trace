// Workshop agent tools, part 3: read handlers (find_weaver, find_hats, get_hat). Reads go through the
// injected DataLayer; results also mark what the run has "seen" so propose tools can check grounding.
import { detectAnomalies, foldText, matchCode, matchWeavers, normalizeCode, stageIndex, stageName } from "../domain.ts";
import {
  type Args,
  type HatRow,
  MAX_FIND_RESULTS,
  type RunContext,
  type WeaverRow,
  codeInNote,
  fail,
  isOpen,
  nameInNote,
  optStr,
  rememberHat,
  workshopHats,
  workshopWeavers,
} from "./context.ts";

// ---------------------------------------------------------------------------
// Read handlers
// ---------------------------------------------------------------------------

/** Weavers a name lookup returned. propose_create_hats accepts only these, and only from a lookup with one match. */
function rememberWeavers(ctx: RunContext, matches: WeaverRow[]): void {
  for (const w of matches) {
    ctx.seenWeavers.set(w.id, w);
    const prev = ctx.weaverLookupSize.get(w.id);
    ctx.weaverLookupSize.set(w.id, Math.min(prev ?? Infinity, matches.length));
  }
}

export async function findWeaver(ctx: RunContext, args: Args) {
  const name = typeof args.name === "string" ? args.name : "";
  const folded = foldText(name);
  if (folded.length < 1 || folded.length > 60) fail("name must be 1 to 60 characters.");
  const weavers = await workshopWeavers(ctx);
  const matches = matchWeavers(name, weavers);
  const hats = await workshopHats(ctx);
  rememberWeavers(ctx, matches);
  if (matches.length === 0) ctx.notFound.add(name.trim().slice(0, 40));
  return {
    query: name,
    match_count: matches.length,
    matches: matches.map((w) => ({
      weaver_id: w.id,
      name: w.name,
      village: w.village,
      province: w.province,
      specialty: w.specialty ?? [],
      open_hats: hats.filter((h) => h.weaver_id === w.id && isOpen(h)).length,
    })),
    note:
      matches.length > 1
        ? "Several weavers match. Do not pick one: call ask_question with them as choices."
        : matches.length === 0
          ? "No weaver found. Do not create one: call ask_question with no choices."
          : undefined,
  };
}

function hatOut(h: HatRow, weavers: WeaverRow[], extra: Record<string, unknown>) {
  const w = h.weaver_id ? weavers.find((x) => x.id === h.weaver_id) : undefined;
  // Only problems visible in the record itself (grade vs rows). Timing problems such as too_fast
  // need the hat's events: get_hat reports those as anomalies.
  const issues = detectAnomalies(h, [])
    .map((a) => a.kind)
    .filter((k) => k !== "too_fast");
  return {
    code: h.code,
    ...extra,
    grade: h.grade,
    rows_per_inch: h.rows_per_inch,
    stage: stageName(h.stage),
    weaver: w ? { id: w.id, name: w.name } : null,
    owner_type: h.owner_type,
    archived: h.archived,
    record_issues: issues,
  };
}

export async function findHats(ctx: RunContext, args: Args) {
  const rawCodes = Array.isArray(args.codes)
    ? args.codes.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    : typeof args.codes === "string" && args.codes.trim()
      ? [args.codes]
      : [];
  const weaverName = optStr(args.weaver_name);
  const stageArg = optStr(args.stage);
  const openOnly = args.open_only !== false;
  if (rawCodes.length === 0 && !weaverName && !stageArg) {
    fail("Give at least one filter: codes, weaver_name or stage.");
  }
  if (rawCodes.length > 10) fail("At most 10 codes per call.");
  let stageFilter: number | null = null;
  if (stageArg) {
    stageFilter = stageIndex(stageArg);
    if (stageFilter === null) fail("stage must be one of Weaving, Washing, Bleaching, Blocking, Finished.");
  }

  const hats = await workshopHats(ctx);
  const weavers = await workshopWeavers(ctx);
  const found = new Map<string, { hat: HatRow; out: Record<string, unknown> }>();
  const notFound: { input: string; candidates: string[] }[] = [];

  for (const input of rawCodes) {
    const n = normalizeCode(input);
    const exact = n ? hats.find((h) => h.code === n) : undefined;
    let hat: HatRow | undefined;
    let match: "exact" | "confusable" | "fuzzy" = "exact";
    if (exact) {
      hat = exact;
    } else {
      const open = hats.filter(isOpen);
      const m = matchCode(
        input,
        open.map((h) => h.code),
      );
      if (m.kind === "confusable" || m.kind === "fuzzy" || m.kind === "exact") {
        hat = open.find((h) => h.code === m.code);
        match = m.kind;
      } else if (m.kind === "ambiguous") {
        notFound.push({ input, candidates: m.candidates });
        continue;
      }
    }
    if (!hat || (openOnly && hat.archived)) {
      notFound.push({ input, candidates: [] });
      ctx.notFound.add(normalizeCode(input) ?? input.trim().slice(0, 20));
      continue;
    }
    const grounded = codeInNote(ctx.note, input) || (ctx.hatTag !== null && hat.code === ctx.hatTag);
    rememberHat(ctx, { hat, match, heard: input, via: "code", grounded });
    found.set(hat.code, { hat, out: hatOut(hat, weavers, { matched_from: input, match }) });
  }

  if (weaverName || stageFilter !== null) {
    let pool = hats;
    if (weaverName) {
      const ws = matchWeavers(weaverName, weavers);
      // Same name match as find_weaver, so these weavers count as looked up too.
      rememberWeavers(ctx, ws);
      const ids = new Set(ws.map((w) => w.id));
      pool = pool.filter((h) => h.weaver_id !== null && ids.has(h.weaver_id));
    }
    if (stageFilter !== null) pool = pool.filter((h) => h.stage === stageFilter);
    if (openOnly) pool = pool.filter(isOpen);
    const grounded = weaverName ? nameInNote(ctx.note, weaverName) : false;
    const group = pool.map((h) => h.code).sort();
    for (const hat of pool) {
      if (found.has(hat.code)) continue;
      rememberHat(ctx, {
        hat,
        match: "exact",
        heard: hat.code,
        via: weaverName ? "weaver" : "stage",
        grounded,
        group,
        ...(weaverName ? { weaverQuery: weaverName } : {}),
      });
      found.set(hat.code, { hat, out: hatOut(hat, weavers, { match: weaverName ? "by_weaver" : "by_stage" }) });
    }
  }

  const all = [...found.values()].sort((a, b) => a.hat.code.localeCompare(b.hat.code));
  return {
    hats: all.slice(0, MAX_FIND_RESULTS).map((x) => x.out),
    not_found: notFound,
    truncated: all.length > MAX_FIND_RESULTS,
  };
}

export async function getHat(ctx: RunContext, args: Args) {
  const raw = typeof args.code === "string" ? args.code : "";
  const code = normalizeCode(raw);
  if (!code) fail("Codes look like TQ-7F3K2.");
  const hat = await ctx.data.getHatByCode(code);
  if (!hat) fail(`No hat ${code} in this workshop. Use find_hats to look for close matches.`);
  const grounded = codeInNote(ctx.note, raw) || ctx.hatTag === hat.code;
  rememberHat(ctx, { hat, match: "exact", heard: raw, via: "code", grounded });
  const events = await ctx.data.getEvents(hat.id);
  const flags = await ctx.data.getOpenFlags(hat.id);
  const weavers = await workshopWeavers(ctx);
  const sorted = [...events].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  return {
    ...hatOut(hat, weavers, { match: "exact" }),
    straw: hat.straw,
    events: sorted.slice(-10).map((e) => ({
      type: e.type,
      from_stage: e.from_stage === null ? null : stageName(e.from_stage),
      to_stage: e.to_stage === null ? null : stageName(e.to_stage),
      created_at: e.created_at,
    })),
    open_flags: flags.map((f) => ({ kind: f.kind, message: f.message })),
    anomalies: detectAnomalies(hat, events, ctx.now()),
  };
}
