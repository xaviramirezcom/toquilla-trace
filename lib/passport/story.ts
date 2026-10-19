// buildStory: the 5-step public timeline built from hat_events (spec 06 section 6). Pure.
import { STAGES } from "@domain/domain";
import { daysBetween, formatDate, formatShortDate, humanDuration } from "./format";
import type { Passport, StoryStep } from "./types";

type StoryInput = Pick<Passport, "stage" | "weaving_started_at" | "created_at" | "events" | "weaver" | "workshop">;

/** `at` of the first stage_advanced event into each stage (index 1..4). */
export function stageDates(p: Pick<Passport, "events">): (string | null)[] {
  const out: (string | null)[] = [null, null, null, null, null];
  for (const e of p.events ?? []) {
    if (e.type !== "stage_advanced" || e.to_stage === null) continue;
    const i = e.to_stage;
    if (i >= 1 && i <= 4 && out[i] === null) out[i] = e.at;
  }
  return out;
}

export function weavingStart(p: Pick<Passport, "weaving_started_at" | "events" | "created_at">): string {
  return p.weaving_started_at ?? p.events?.find((e) => e.type === "created")?.at ?? p.created_at;
}

function place(p: Pick<Passport, "weaver">): string | null {
  const parts = [p.weaver?.village, p.weaver?.province].filter((x): x is string => !!x);
  return parts.length ? parts.join(", ") : null;
}

const FIXED: Record<number, (p: StoryInput) => string> = {
  1: () => "Washed in clean water to soften the straw",
  2: () => "Evened in tone, keeping its natural color",
  3: () => "Shaped on a wooden form",
  4: (p) => `Trimmed, banded and approved by ${p.workshop?.name ?? "the workshop"}`,
};

export function buildStory(p: StoryInput): StoryStep[] {
  const at = stageDates(p);
  const stage = Math.max(0, Math.min(4, Math.trunc(p.stage)));
  const start = weavingStart(p);
  const where = place(p);

  return STAGES.map((name, i): StoryStep => {
    const finished = stage === 4;
    const state: StoryStep["state"] = i < stage || (finished && i === 4) ? "done" : i === stage ? "current" : "upcoming";
    if (state === "upcoming") return { stage: name, state, date: null, desc: "Not yet" };

    if (i === 0) {
      const end = at[1];
      if (state === "current" || !end) {
        return {
          stage: name,
          state,
          date: state === "current" ? `Since ${formatShortDate(start)}` : null,
          desc:
            state === "current"
              ? `Being hand-woven${where ? ` in ${where}` : ""}`
              : "Date not recorded",
        };
      }
      const duration = humanDuration(daysBetween(start, end));
      return {
        stage: name,
        state,
        date: `${formatShortDate(start)} to ${formatShortDate(end)}`,
        desc: `About ${duration} of hand-weaving${where ? ` in ${where}` : ""}`,
      };
    }

    const date = at[i];
    if (state === "current") {
      return { stage: name, state, date: date ? `In progress since ${formatShortDate(date)}` : null, desc: FIXED[i](p) };
    }
    if (!date) return { stage: name, state, date: null, desc: "Date not recorded" };
    return { stage: name, state, date: formatShortDate(date), desc: FIXED[i](p) };
  });
}

/** Certificate line 3: "Finished Oct 2, 2026" or "In production · Washing since Oct 14, 2026". */
export function certificateStatus(p: Pick<Passport, "stage" | "events" | "weaving_started_at" | "created_at">): string {
  const at = stageDates(p);
  if (p.stage >= 4) {
    const d = formatDate(at[4]);
    return d ? `Finished ${d}` : "Finished";
  }
  const name = STAGES[Math.max(0, p.stage)] ?? STAGES[0];
  const since = formatDate(p.stage === 0 ? weavingStart(p) : at[p.stage]);
  return since ? `In production · ${name} since ${since}` : `In production · ${name}`;
}
