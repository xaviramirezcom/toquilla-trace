import { describe, expect, it } from "vitest";
import {
  MAX_RECORDING_MS,
  buildAgentRequest,
  canSendNote,
  composerReducer,
  counterTone,
  formatTimer,
  initialComposerState,
  transition,
  type ComposerState,
  type Phase,
} from "@/lib/voice/reducer";
import { isLikelyCode, lowWordsInNote, toWords, type SpeechResultListLike, type Word } from "@/lib/voice/words";

function results(...rs: { t: string; c: number; final: boolean }[]): SpeechResultListLike {
  return rs.map((r) => Object.assign([{ transcript: r.t, confidence: r.c }], { isFinal: r.final }));
}

const w = (text: string, low = false, confirmed = true): Word => ({ w: text, low, confirmed });

function recording(over: Partial<Extract<Phase, { kind: "recording" }>> = {}, s: Partial<ComposerState> = {}): ComposerState {
  return initialComposerState({
    perm: "granted",
    ...s,
    phase: {
      kind: "recording",
      mode: "tap",
      startedAt: 0,
      elapsedMs: 0,
      words: [],
      baseNote: "",
      rerecord: false,
      heardAny: false,
      ...over,
    },
  });
}

describe("composerReducer (spec 02 table)", () => {
  it("idle + MIC_DOWN with permission granted starts hold recording and the recognizer", () => {
    const t = transition(initialComposerState({ perm: "granted" }), { type: "MIC_DOWN", now: 0 });
    expect(t.state.phase).toMatchObject({ kind: "recording", mode: "hold" });
    expect(t.effects).toContainEqual({ type: "start", lang: "es-EC" });
    expect(t.effects.some((e) => e.type === "log" && e.action === "voice.start")).toBe(true);
  });

  it("a hold shorter than 350 ms becomes tap mode", () => {
    const s = composerReducer(recording({ mode: "hold" }), { type: "MIC_UP", now: 200, heldMs: 200 });
    expect(s.phase).toMatchObject({ kind: "recording", mode: "tap" });
  });

  it("releasing a long hold goes to review with the transcript", () => {
    const t = transition(recording({ mode: "hold", words: [w("Doña"), w("Rosa"), w("terminó")] }), {
      type: "MIC_UP",
      now: 900,
      heldMs: 900,
    });
    expect(t.state.phase.kind).toBe("review");
    expect(t.state.note).toBe("Doña Rosa terminó");
    expect(t.state.usedVoice).toBe(true);
    expect(t.effects).toContainEqual({ type: "stop" });
  });

  it("stopping a tap recording with no words goes to silence", () => {
    expect(composerReducer(recording({ mode: "tap" }), { type: "STOP", now: 3000 }).phase.kind).toBe("silence");
  });

  it("slide to cancel drops the recording and keeps the earlier text", () => {
    const t = transition(recording({ baseNote: "Hola", words: [w("mundo")] }, { note: "Hola" }), {
      type: "CANCEL",
      now: 1000,
      reason: "slide",
    });
    expect(t.state.phase.kind).toBe("idle");
    expect(t.state.note).toBe("Hola");
    expect(t.effects).toContainEqual({ type: "toast", kind: "info", message: "Recording discarded." });
  });

  it("auto-stops at 2:00 into review", () => {
    const s0 = recording({ words: [w("hola")], heardAny: true, elapsedMs: 119_000 });
    const s = composerReducer(s0, { type: "TICK", now: MAX_RECORDING_MS });
    expect(s.phase.kind).toBe("review");
  });

  it("no result in the first 8 s is silence", () => {
    const t = transition(recording(), { type: "TICK", now: 8000 });
    expect(t.state.phase.kind).toBe("silence");
    expect(t.effects).toContainEqual({ type: "abort" });
  });

  it("not-allowed shows the blocked notice and logs the permission", () => {
    const t = transition(recording(), { type: "SR_ERROR", now: 10, code: "not-allowed" });
    expect(t.state.phase.kind).toBe("blocked");
    expect(t.state.perm).toBe("denied");
    expect(t.effects.some((e) => e.type === "log" && e.action === "voice.permission")).toBe(true);
  });

  it("a network error keeps the words in review with lost = true", () => {
    const s = composerReducer(recording({ words: [w("El"), w("TQ-7F3K2", true)] }), {
      type: "SR_ERROR",
      now: 10,
      code: "network",
    });
    expect(s.phase).toMatchObject({ kind: "review", lost: true });
    expect(s.note).toBe("El TQ-7F3K2");
  });

  it("aborted errors are ignored", () => {
    const s0 = recording({ words: [w("hola")] });
    expect(composerReducer(s0, { type: "SR_ERROR", now: 1, code: "aborted" })).toBe(s0);
  });

  it("service-not-allowed hides the mic and switches to typing", () => {
    const s = composerReducer(recording(), { type: "SR_ERROR", now: 1, code: "service-not-allowed" });
    expect(s.supported).toBe(false);
    expect(s.typing).toBe(true);
    expect(s.phase.kind).toBe("idle");
  });

  it("first use with an unknown permission shows the explaining notice", () => {
    const s = composerReducer(initialComposerState({ perm: "prompt" }), { type: "MIC_CLICK", now: 0 });
    expect(s.phase.kind).toBe("explaining");
  });

  it("ALLOW from explaining sets the flag and starts tap recording", () => {
    const t = transition(initialComposerState({ phase: { kind: "explaining" } }), { type: "ALLOW", now: 0 });
    expect(t.state.phase).toMatchObject({ kind: "recording", mode: "tap" });
    expect(t.state.explained).toBe(true);
    expect(t.effects).toContainEqual({ type: "setExplained" });
  });

  it("denied permission shows the blocked notice instead of starting", () => {
    const s = composerReducer(initialComposerState({ perm: "denied" }), { type: "MIC_CLICK", now: 0 });
    expect(s.phase.kind).toBe("blocked");
  });

  it("does not send a note over 1000 characters", () => {
    const s0 = initialComposerState({ note: "x".repeat(1001), phase: { kind: "review", lowWords: [], lost: false, baseNote: "" } });
    expect(composerReducer(s0, { type: "SEND", now: 0, requestId: "req_000000000000" })).toBe(s0);
  });

  it("does not send a blank note", () => {
    const s0 = initialComposerState({ note: "  ", phase: { kind: "review", lowWords: [], lost: false, baseNote: "" } });
    expect(composerReducer(s0, { type: "SEND", now: 0, requestId: "req_000000000000" })).toBe(s0);
  });

  it("sending emits the request with input mode and hat tag", () => {
    const s0 = initialComposerState({ note: " hola ", usedVoice: true, hatTag: "TQ-7F3K2" });
    const t = transition(s0, { type: "SEND", now: 5, requestId: "req_aaaaaaaaaaaa" });
    expect(t.state.phase).toMatchObject({ kind: "sending", requestId: "req_aaaaaaaaaaaa", step: 0 });
    expect(t.effects).toContainEqual({
      type: "send",
      requestId: "req_aaaaaaaaaaaa",
      request: { note: "hola", input_mode: "voice", hat_tag: "TQ-7F3K2" },
    });
  });

  it("steps advance on a timer but never past the last one", () => {
    let s = initialComposerState({ note: "hola", phase: { kind: "sending", requestId: "r", startedAt: 0, step: 0 } });
    for (let i = 0; i < 6; i++) s = composerReducer(s, { type: "STEP_TICK" });
    expect(s.phase).toMatchObject({ kind: "sending", step: 3 });
  });

  it("Stop during sending keeps the note and aborts the request", () => {
    const s0 = initialComposerState({ note: "hola", phase: { kind: "sending", requestId: "r", startedAt: 0, step: 1 } });
    const t = transition(s0, { type: "STOP_RUN", now: 2000 });
    expect(t.state.phase.kind).toBe("idle");
    expect(t.state.note).toBe("hola");
    expect(t.effects).toContainEqual({ type: "abortRequest" });
    expect(t.effects).toContainEqual({ type: "toast", kind: "info", message: "Stopped. Nothing was saved." });
  });

  it("an error response goes to failed and keeps the note", () => {
    const s0 = initialComposerState({ note: "hola", phase: { kind: "sending", requestId: "req_1", startedAt: 0, step: 3 } });
    const s = composerReducer(s0, { type: "RESPONSE_ERR", error: { code: "internal", message: "boom" } });
    expect(s.phase).toMatchObject({ kind: "failed", requestId: "req_1" });
    expect(s.note).toBe("hola");
  });

  it("network failures log ui.error", () => {
    const s0 = initialComposerState({ note: "hola", phase: { kind: "sending", requestId: "req_1", startedAt: 0, step: 3 } });
    const t = transition(s0, { type: "RESPONSE_ERR", error: { code: "network", message: "x" } });
    expect(t.effects.some((e) => e.type === "log" && e.action === "ui.error")).toBe(true);
  });

  it("Try again from failed resends with a new request id", () => {
    const s0 = initialComposerState({
      note: "hola",
      phase: { kind: "failed", error: { code: "internal", message: "x" }, requestId: "req_old" },
    });
    const t = transition(s0, { type: "TRY_AGAIN", now: 0, requestId: "req_new" });
    expect(t.state.phase).toMatchObject({ kind: "sending", requestId: "req_new" });
  });

  it("a successful response clears the note and hat tag", () => {
    const s0 = initialComposerState({
      note: "hola",
      hatTag: "TQ-7F3K2",
      usedVoice: true,
      phase: { kind: "sending", requestId: "r", startedAt: 0, step: 3 },
    });
    const s = composerReducer(s0, { type: "RESPONSE_OK" });
    expect(s).toMatchObject({ note: "", hatTag: null, usedVoice: false, phase: { kind: "idle" } });
  });

  it("ignores the language toggle while recording", () => {
    const s0 = recording();
    expect(composerReducer(s0, { type: "LANG_TOGGLE" }).lang).toBe("es-EC");
  });

  it("toggles and persists the language when idle", () => {
    const t = transition(initialComposerState(), { type: "LANG_TOGGLE" });
    expect(t.state.lang).toBe("en-US");
    expect(t.effects).toContainEqual({ type: "persistLang", lang: "en-US" });
  });

  it("recording appends to existing text", () => {
    const s0 = recording({ baseNote: "Hola", words: [w("mundo")] }, { note: "Hola" });
    expect(composerReducer(s0, { type: "STOP", now: 1000 }).note).toBe("Hola mundo");
  });

  it("re-record replaces only the transcript part", () => {
    const s0 = initialComposerState({
      note: "Hola mundo",
      usedVoice: true,
      phase: { kind: "review", lowWords: [], lost: false, baseNote: "Hola" },
    });
    const s = composerReducer(s0, { type: "RERECORD", now: 0 });
    expect(s.phase).toMatchObject({ kind: "recording", baseNote: "Hola", rerecord: true });
  });

  it("discard in review empties the note", () => {
    const s0 = initialComposerState({ note: "x", usedVoice: true, phase: { kind: "review", lowWords: [], lost: false, baseNote: "" } });
    const t = transition(s0, { type: "DISCARD" });
    expect(t.state).toMatchObject({ note: "", usedVoice: false, phase: { kind: "idle" } });
    expect(t.effects).toContainEqual({ type: "toast", kind: "info", message: "Voice note discarded." });
  });

  it("an unexpected end with words goes to review", () => {
    expect(composerReducer(recording({ words: [w("hola")] }), { type: "SR_END", now: 1 }).phase.kind).toBe("review");
  });

  it("the mic does nothing when voice is unsupported", () => {
    const s0 = initialComposerState({ supported: false, perm: "granted" });
    expect(composerReducer(s0, { type: "MIC_CLICK", now: 0 }).phase.kind).toBe("idle");
  });
});

describe("toWords and isLikelyCode", () => {
  it("high confidence final words are not low", () => {
    const ws = toWords(results({ t: "Doña Rosa terminó", c: 0.92, final: true }));
    expect(ws).toHaveLength(3);
    expect(ws.some((x) => x.low)).toBe(false);
  });

  it("low confidence final words are low", () => {
    const ws = toWords(results({ t: "18 hileras", c: 0.41, final: true }));
    expect(ws.every((x) => x.low)).toBe(true);
  });

  it("confidence 0 means unknown, not low", () => {
    expect(toWords(results({ t: "hola", c: 0, final: true }))[0].low).toBe(false);
  });

  it("interim words are unconfirmed and never low", () => {
    const ws = toWords(results({ t: "pasa a", c: 0.2, final: false }));
    expect(ws).toEqual([w("pasa", false, false), w("a", false, false)]);
  });

  it("spoken codes are low even at high confidence", () => {
    const ws = toWords(results({ t: "el TQ 7F3K2", c: 0.95, final: true }));
    expect(ws.map((x) => x.low)).toEqual([false, true, true]);
  });

  it.each([
    ["TQ-7F3K2", true],
    ["tq", true],
    ["7F3K2", true],
    ["18", false],
    ["hileras", false],
    ["B2", true],
  ])("isLikelyCode(%s) = %s", (input, expected) => {
    expect(isLikelyCode(input)).toBe(expected);
  });

  it("unsure chips list only low words still in the note", () => {
    expect(lowWordsInNote(["TQ-7F3K2", "18"], "El TQ-7F3K2 pasa")).toEqual(["TQ-7F3K2"]);
  });
});

describe("helpers", () => {
  it("buildAgentRequest trims and keeps a valid hat tag", () => {
    expect(buildAgentRequest({ note: "  hola ", usedVoice: true, hatTag: "TQ-7F3K2" })).toEqual({
      note: "hola",
      input_mode: "voice",
      hat_tag: "TQ-7F3K2",
    });
  });

  it("buildAgentRequest drops an invalid hat tag", () => {
    expect(buildAgentRequest({ note: "hola", usedVoice: false, hatTag: "bad" })).toEqual({ note: "hola", input_mode: "typed" });
  });

  it("canSendNote enforces 1..1000 after trim", () => {
    expect(canSendNote("")).toBe(false);
    expect(canSendNote("a".repeat(1000))).toBe(true);
    expect(canSendNote("a".repeat(1001))).toBe(false);
  });

  it("counter tone turns warn above 900 and err above 1000", () => {
    expect(counterTone(900)).toBe("muted");
    expect(counterTone(901)).toBe("warn");
    expect(counterTone(1001)).toBe("err");
  });

  it("formats the timer", () => {
    expect(formatTimer(7_400)).toBe("0:07");
    expect(formatTimer(110_000)).toBe("1:50");
  });
});
