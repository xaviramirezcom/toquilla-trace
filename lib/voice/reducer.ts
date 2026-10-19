// Voice composer state machine (spec 02 section 6). Pure: `transition(state, event)` returns the next
// state plus a list of side effects. The hook runs the effects synchronously inside the user's
// gesture (iOS only starts recognition from a gesture), so they are data here, not callbacks.
import { isValidCode } from "@domain/domain";
import type { LogAction } from "@domain/log-format";
import { lowWordsOf, wordsToText, type Word } from "./words";

export const NOTE_MAX = 1000;
export const NOTE_WARN = 900;
export const MAX_RECORDING_MS = 120_000;
export const RECORDING_AMBER_MS = 110_000;
export const NO_SPEECH_MS = 8_000;
export const HOLD_THRESHOLD_MS = 350;
export const SLIDE_CANCEL_PX = 110;
export const SLIDE_WARN_PX = 60;
/** D13: generic timed steps. Step i shows at STEP_DELAYS_MS[i]; the last spins until the response. */
export const STEP_DELAYS_MS = [0, 1200, 2400, 3600] as const;
export const AGENT_STEPS = [
  "Reading your note...",
  "Looking up weavers and hats...",
  "Checking stage rules...",
  "Preparing proposals...",
] as const;
export const SEND_TIMEOUT_MS = 60_000;

export type Lang = "es-EC" | "en-US";
export type Perm = "granted" | "prompt" | "denied" | "unknown";
export type InputMode = "voice" | "typed";
export type RecordMode = "hold" | "tap";
export type StopReason = "user" | "max_2min" | "silence" | "ended";
export type CancelReason = "slide" | "button" | "esc";

export interface AgentError {
  code: string;
  message: string;
  requestId?: string;
  runId?: string;
}

export type Phase =
  | { kind: "idle" }
  | { kind: "explaining" }
  | { kind: "blocked" }
  | { kind: "silence" }
  | {
      kind: "recording";
      mode: RecordMode;
      startedAt: number;
      elapsedMs: number;
      words: Word[];
      /** Text that was in the box before this recording; kept on cancel. */
      baseNote: string;
      rerecord: boolean;
      heardAny: boolean;
    }
  | { kind: "review"; lowWords: string[]; lost: boolean; baseNote: string }
  | { kind: "sending"; requestId: string; startedAt: number; step: number }
  | { kind: "failed"; error: AgentError; requestId: string };

export interface ComposerState {
  note: string;
  /** True when any recording contributed to the note (input_mode "voice"). */
  usedVoice: boolean;
  hatTag: string | null;
  lang: Lang;
  perm: Perm;
  /** First-use notice was accepted (`tt-mic-explained`). */
  explained: boolean;
  /** Mobile layout flag: pill textarea instead of the big mic. */
  typing: boolean;
  /** Web Speech exists in this browser. False hides the mic. */
  supported: boolean;
  phase: Phase;
}

export type ComposerEvent =
  | { type: "MIC_DOWN"; now: number }
  | { type: "MIC_CLICK"; now: number }
  | { type: "MIC_UP"; now: number; heldMs: number }
  | { type: "STOP"; now: number }
  | { type: "CANCEL"; now: number; reason: CancelReason }
  | { type: "ALLOW"; now: number }
  | { type: "TYPE_INSTEAD" }
  | { type: "DISMISS_NOTICE" }
  | { type: "TRY_AGAIN"; now: number; requestId: string }
  | { type: "RESULT"; now: number; words: Word[] }
  | { type: "TICK"; now: number }
  | { type: "SR_END"; now: number }
  | { type: "SR_ERROR"; now: number; code: string }
  | { type: "EDIT"; note: string }
  | { type: "RERECORD"; now: number }
  | { type: "DISCARD" }
  | { type: "SEND"; now: number; requestId: string }
  | { type: "STEP_TICK" }
  | { type: "RESPONSE_OK" }
  | { type: "RESPONSE_ERR"; error: AgentError }
  | { type: "STOP_RUN"; now: number }
  | { type: "LANG_TOGGLE" }
  | { type: "PERM_CHANGE"; perm: Perm }
  | { type: "SET_TYPING"; typing: boolean }
  | { type: "SET_HAT"; hatTag: string | null }
  | { type: "UNSUPPORTED" };

export interface AgentRequest {
  note: string;
  input_mode: InputMode;
  hat_tag?: string;
}

export type Effect =
  | { type: "start"; lang: Lang }
  | { type: "stop" }
  | { type: "abort" }
  | { type: "send"; request: AgentRequest; requestId: string }
  | { type: "abortRequest" }
  | { type: "toast"; kind: "info" | "success" | "warning" | "error"; message: string }
  | { type: "log"; level: "info" | "warn" | "error"; action: LogAction; payload: Record<string, unknown> }
  | { type: "focusTextarea" }
  | { type: "setExplained" }
  | { type: "persistLang"; lang: Lang };

export interface Transition {
  state: ComposerState;
  effects: Effect[];
}

export const COPY = {
  recordingDiscarded: "Recording discarded.",
  voiceDiscarded: "Voice note discarded.",
  stopped: "Stopped. Nothing was saved.",
  firstUse:
    "We need your microphone to turn your voice into a note. Toquilla Trace doesn't store audio. Your browser's speech service turns it into text.",
  blocked: "Microphone is blocked. Allow it in your browser settings, or type your note instead.",
  unsupported: "Voice isn't supported in this browser. Type your note instead.",
  silence: "Couldn't hear anything. Try again closer to the phone.",
  lost: "Voice input stopped. Your text so far is saved.",
  failed: "The assistant couldn't finish. Your note is still here.",
  rateLimited: "You've sent a lot of notes. Try again in a few minutes.",
  lowWord: "Not sure I heard this right.",
} as const;

export function initialComposerState(over: Partial<ComposerState> = {}): ComposerState {
  return {
    note: "",
    usedVoice: false,
    hatTag: null,
    lang: "es-EC",
    perm: "unknown",
    explained: false,
    typing: false,
    supported: true,
    phase: { kind: "idle" },
    ...over,
  };
}

/** Send is allowed only for 1..1000 characters after trimming (spec 02 rule 2). */
export function canSendNote(note: string): boolean {
  const t = note.trim();
  return t.length > 0 && t.length <= NOTE_MAX;
}

export function counterTone(length: number): "muted" | "warn" | "err" {
  if (length > NOTE_MAX) return "err";
  if (length > NOTE_WARN) return "warn";
  return "muted";
}

export function buildAgentRequest(args: { note: string; usedVoice: boolean; hatTag?: string | null }): AgentRequest {
  const req: AgentRequest = { note: args.note.trim(), input_mode: args.usedVoice ? "voice" : "typed" };
  if (args.hatTag && isValidCode(args.hatTag)) req.hat_tag = args.hatTag;
  return req;
}

/** "0:07" */
export function formatTimer(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function joinNote(base: string, transcript: string): string {
  return `${base} ${transcript}`.trim();
}

function startRecording(s: ComposerState, now: number, mode: RecordMode, rerecord: boolean, baseNote: string): Transition {
  return {
    state: {
      ...s,
      phase: { kind: "recording", mode, startedAt: now, elapsedMs: 0, words: [], baseNote, rerecord, heardAny: false },
    },
    effects: [
      { type: "start", lang: s.lang },
      { type: "log", level: "info", action: "voice.start", payload: { lang: s.lang, mode, rerecord } },
    ],
  };
}

/** What pressing the mic does from idle: start, or show a notice first. */
function micFromIdle(s: ComposerState, now: number, mode: RecordMode): Transition {
  if (!s.supported) return { state: s, effects: [] };
  if (s.perm === "denied") return { state: { ...s, phase: { kind: "blocked" } }, effects: [] };
  if ((s.perm === "prompt" || s.perm === "unknown") && !s.explained) {
    return { state: { ...s, phase: { kind: "explaining" } }, effects: [] };
  }
  return startRecording(s, now, mode, false, s.note);
}

type Recording = Extract<Phase, { kind: "recording" }>;

/** Ends a recording into review, or silence when nothing was heard (spec 02 rule 7). */
function finishRecording(
  s: ComposerState,
  r: Recording,
  now: number,
  reason: StopReason,
  effect: "stop" | "abort" | null,
): Transition {
  const transcript = wordsToText(r.words);
  const low = lowWordsOf(r.words);
  const effects: Effect[] = effect ? [{ type: effect }] : [];
  const duration_ms = Math.max(0, now - r.startedAt);
  if (!transcript) {
    effects.push({
      type: "log",
      level: "info",
      action: "voice.stop",
      payload: { reason, duration_ms, words: 0, low_words: 0, chars: 0 },
    });
    return { state: { ...s, note: r.baseNote, phase: { kind: "silence" } }, effects };
  }
  const note = joinNote(r.baseNote, transcript);
  effects.push({
    type: "log",
    level: "info",
    action: "voice.stop",
    payload: { reason, duration_ms, words: r.words.length, low_words: low.length, chars: note.length },
  });
  return {
    state: { ...s, note, usedVoice: true, phase: { kind: "review", lowWords: low, lost: false, baseNote: r.baseNote } },
    effects,
  };
}

function cancelRecording(s: ComposerState, r: Recording, now: number, reason: CancelReason): Transition {
  return {
    state: { ...s, note: r.baseNote, phase: { kind: "idle" } },
    effects: [
      { type: "abort" },
      { type: "toast", kind: "info", message: COPY.recordingDiscarded },
      { type: "log", level: "info", action: "voice.cancel", payload: { reason, duration_ms: Math.max(0, now - r.startedAt) } },
    ],
  };
}

function srError(s: ComposerState, r: Recording, now: number, code: string): Transition {
  if (code === "aborted") return { state: s, effects: [] };
  const errLog: Effect = { type: "log", level: "warn", action: "voice.error", payload: { code, lang: s.lang } };
  if (code === "not-allowed" || code === "audio-capture") {
    const effects: Effect[] = [errLog];
    if (code === "not-allowed") {
      effects.push({ type: "log", level: "info", action: "voice.permission", payload: { state: "denied", via: "error" } });
    }
    return {
      state: { ...s, note: r.baseNote, perm: code === "not-allowed" ? "denied" : s.perm, phase: { kind: "blocked" } },
      effects,
    };
  }
  if (code === "service-not-allowed") {
    return {
      state: { ...s, note: r.baseNote, supported: false, typing: true, phase: { kind: "idle" } },
      effects: [errLog, { type: "focusTextarea" }],
    };
  }
  if (code === "no-speech" && r.words.length === 0) {
    return { state: { ...s, note: r.baseNote, phase: { kind: "silence" } }, effects: [errLog] };
  }
  // network and anything else: keep what was heard, show "Voice input stopped" in review.
  const transcript = wordsToText(r.words);
  const note = joinNote(r.baseNote, transcript);
  return {
    state: {
      ...s,
      note,
      usedVoice: s.usedVoice || transcript.length > 0,
      phase: { kind: "review", lowWords: lowWordsOf(r.words), lost: true, baseNote: r.baseNote },
    },
    effects: [errLog],
  };
}

function send(s: ComposerState, now: number, requestId: string): Transition {
  if (!canSendNote(s.note)) return { state: s, effects: [] };
  const request = buildAgentRequest({ note: s.note, usedVoice: s.usedVoice, hatTag: s.hatTag });
  return {
    state: { ...s, phase: { kind: "sending", requestId, startedAt: now, step: 0 } },
    effects: [{ type: "send", request, requestId }],
  };
}

export function transition(s: ComposerState, e: ComposerEvent): Transition {
  const p = s.phase;
  const same: Transition = { state: s, effects: [] };

  // Events that work in any phase.
  switch (e.type) {
    case "LANG_TOGGLE": {
      if (p.kind === "recording" || p.kind === "sending") return same;
      const lang: Lang = s.lang === "es-EC" ? "en-US" : "es-EC";
      return { state: { ...s, lang }, effects: [{ type: "persistLang", lang }] };
    }
    case "PERM_CHANGE": {
      const next = { ...s, perm: e.perm };
      if (e.perm === "granted" && p.kind === "blocked") next.phase = { kind: "idle" };
      return { state: next, effects: [] };
    }
    case "SET_TYPING":
      return { state: { ...s, typing: e.typing }, effects: e.typing ? [{ type: "focusTextarea" }] : [] };
    case "SET_HAT":
      if (p.kind === "sending") return same;
      return { state: { ...s, hatTag: e.hatTag && isValidCode(e.hatTag) ? e.hatTag : null }, effects: [] };
    case "UNSUPPORTED":
      return { state: { ...s, supported: false, typing: true }, effects: [] };
    default:
      break;
  }

  switch (p.kind) {
    case "idle":
      switch (e.type) {
        case "MIC_DOWN":
          return micFromIdle(s, e.now, "hold");
        case "MIC_CLICK":
          return micFromIdle(s, e.now, "tap");
        case "EDIT":
          return { state: { ...s, note: e.note, usedVoice: e.note.trim() ? s.usedVoice : false }, effects: [] };
        case "SEND":
          return send(s, e.now, e.requestId);
        default:
          return same;
      }

    case "explaining":
    case "blocked":
    case "silence":
      switch (e.type) {
        case "ALLOW":
          if (p.kind !== "explaining") return same;
          {
            const started = startRecording({ ...s, explained: true }, e.now, "tap", false, s.note);
            return {
              state: started.state,
              effects: [
                { type: "setExplained" },
                { type: "log", level: "info", action: "voice.permission", payload: { state: s.perm, via: "allow_click" } },
                ...started.effects,
              ],
            };
          }
        case "TRY_AGAIN":
          if (p.kind !== "silence") return same;
          return startRecording(s, e.now, "tap", false, s.note);
        case "MIC_CLICK":
        case "MIC_DOWN":
          if (p.kind === "silence") return startRecording(s, e.now, e.type === "MIC_DOWN" ? "hold" : "tap", false, s.note);
          return same;
        case "TYPE_INSTEAD":
          return { state: { ...s, typing: true, phase: { kind: "idle" } }, effects: [{ type: "focusTextarea" }] };
        case "DISMISS_NOTICE":
          return { state: { ...s, phase: { kind: "idle" } }, effects: [] };
        case "EDIT":
          return { state: { ...s, note: e.note, phase: { kind: "idle" } }, effects: [] };
        default:
          return same;
      }

    case "recording":
      switch (e.type) {
        case "RESULT":
          return { state: { ...s, phase: { ...p, words: e.words, heardAny: p.heardAny || e.words.length > 0 } }, effects: [] };
        case "MIC_UP":
          if (p.mode !== "hold") return same;
          if (e.heldMs < HOLD_THRESHOLD_MS) return { state: { ...s, phase: { ...p, mode: "tap" } }, effects: [] };
          return finishRecording(s, p, e.now, "user", "stop");
        case "MIC_CLICK":
        case "MIC_DOWN":
          if (p.mode === "tap") return finishRecording(s, p, e.now, "user", "stop");
          return same;
        case "STOP":
          return finishRecording(s, p, e.now, "user", "stop");
        case "TICK": {
          const elapsedMs = Math.max(0, e.now - p.startedAt);
          if (elapsedMs >= MAX_RECORDING_MS) return finishRecording(s, p, e.now, "max_2min", "stop");
          if (!p.heardAny && p.words.length === 0 && elapsedMs >= NO_SPEECH_MS) {
            return finishRecording(s, p, e.now, "silence", "abort");
          }
          return { state: { ...s, phase: { ...p, elapsedMs } }, effects: [] };
        }
        case "CANCEL":
          return cancelRecording(s, p, e.now, e.reason);
        case "SR_END":
          return finishRecording(s, p, e.now, "ended", null);
        case "SR_ERROR":
          return srError(s, p, e.now, e.code);
        default:
          return same;
      }

    case "review":
      switch (e.type) {
        case "EDIT":
          return { state: { ...s, note: e.note }, effects: [] };
        case "RERECORD":
          return startRecording(s, e.now, "tap", true, p.baseNote);
        case "MIC_CLICK":
        case "MIC_DOWN":
          return startRecording(s, e.now, e.type === "MIC_DOWN" ? "hold" : "tap", true, s.note);
        case "DISCARD":
          return {
            state: { ...s, note: "", usedVoice: false, phase: { kind: "idle" } },
            effects: [
              { type: "toast", kind: "info", message: COPY.voiceDiscarded },
              { type: "log", level: "info", action: "voice.cancel", payload: { reason: "discard_review", duration_ms: 0 } },
            ],
          };
        case "SEND":
          return send(s, e.now, e.requestId);
        default:
          return same;
      }

    case "sending":
      switch (e.type) {
        case "STEP_TICK":
          return { state: { ...s, phase: { ...p, step: Math.min(AGENT_STEPS.length - 1, p.step + 1) } }, effects: [] };
        case "RESPONSE_OK":
          return { state: { ...s, note: "", usedVoice: false, hatTag: null, typing: false, phase: { kind: "idle" } }, effects: [] };
        case "RESPONSE_ERR": {
          const effects: Effect[] = [];
          if (e.error.code === "network" || e.error.code === "timeout") {
            effects.push({
              type: "log",
              level: "error",
              action: "ui.error",
              payload: { where: "composer.send", code: e.error.code },
            });
          }
          return {
            state: { ...s, phase: { kind: "failed", error: e.error, requestId: e.error.requestId ?? p.requestId } },
            effects,
          };
        }
        case "STOP_RUN":
          return {
            state: { ...s, phase: { kind: "idle" } },
            effects: [
              { type: "abortRequest" },
              { type: "toast", kind: "info", message: COPY.stopped },
              {
                type: "log",
                level: "info",
                action: "agent.run.end",
                payload: { status: "stopped", waited_ms: Math.max(0, e.now - p.startedAt) },
              },
            ],
          };
        default:
          return same;
      }

    case "failed":
      switch (e.type) {
        case "TRY_AGAIN":
          return send(s, e.now, e.requestId);
        case "SEND":
          return send(s, e.now, e.requestId);
        case "EDIT":
          return { state: { ...s, note: e.note, phase: { kind: "idle" } }, effects: [] };
        case "MIC_CLICK":
        case "MIC_DOWN":
          return micFromIdle({ ...s, phase: { kind: "idle" } }, e.now, e.type === "MIC_DOWN" ? "hold" : "tap");
        default:
          return same;
      }
  }
}

/** Reducer form for tests and `useReducer`. Effects are dropped. */
export function composerReducer(s: ComposerState, e: ComposerEvent): ComposerState {
  return transition(s, e).state;
}

/**
 * `/workshop?record=1` (from the mobile mic shortcut or a hat's "Record update"): start the mic
 * once, after the permission query has settled. The normal MIC_CLICK path then runs the
 * permission flow: explainer for "prompt"/"unknown", blocked hint for "denied", recording for
 * "granted". Never fires while something else is happening or in a browser without voice.
 */
export function shouldAutoRecord(input: {
  requested: boolean;
  alreadyStarted: boolean;
  permReady: boolean;
  supported: boolean;
  phase: string;
}): boolean {
  return input.requested && !input.alreadyStarted && input.permReady && input.supported && input.phase === "idle";
}
