"use client";

// Runs the pure composer machine (lib/voice/reducer.ts) and its side effects: speech recognition,
// timers, the workshop-agent call, toasts and logs. Effects run synchronously in the event handler,
// so starting the recognizer stays inside the user's gesture (iOS requirement).
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { log } from "@/lib/log";
import { newRequestId } from "@/lib/request-id";
import { callWorkshopAgent, type AgentResponse } from "@/lib/workshop/api";
import {
  STEP_DELAYS_MS,
  initialComposerState,
  transition,
  type ComposerEvent,
  type ComposerState,
  type Effect,
  type InputMode,
  type Lang,
} from "@/lib/voice/reducer";
import { browserName, isVoiceSupported, useMicPermission, useSpeechRecognition } from "@/lib/voice/useSpeechRecognition";

const LANG_KEY = "tt-voice-lang";
const EXPLAINED_KEY = "tt-mic-explained";

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage blocked: convenience only
  }
}

export interface AgentSuccess {
  response: AgentResponse;
  note: string;
  inputMode: InputMode;
  hatTag?: string;
  clientMs: number;
  requestId: string;
}

export function useComposer(onSuccess: (r: AgentSuccess) => void) {
  const toast = useToast();
  const [state, setState] = useState<ComposerState>(() => initialComposerState());
  const stateRef = useRef(state);
  const abortRef = useRef<AbortController | null>(null);
  const dispatchRef = useRef<(e: ComposerEvent) => void>(() => undefined);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });

  const speech = useSpeechRecognition({
    onWords: (words) => dispatchRef.current({ type: "RESULT", now: Date.now(), words }),
    onError: (code) => dispatchRef.current({ type: "SR_ERROR", now: Date.now(), code }),
    onEnd: () => dispatchRef.current({ type: "SR_END", now: Date.now() }),
  });

  // Both layouts render a textarea (desktop card, mobile dock); focus whichever is visible.
  const focusTextarea = useCallback(() => {
    setTimeout(() => {
      for (const id of ["composer-note-card", "composer-note-dock"]) {
        const el = document.getElementById(id);
        if (el && el.offsetParent !== null) {
          el.focus();
          return;
        }
      }
    }, 0);
  }, []);

  const send = useCallback(async (request: { note: string; input_mode: InputMode; hat_tag?: string }, requestId: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t0 = performance.now();
    const res = await callWorkshopAgent(request, requestId, ctrl.signal);
    if (abortRef.current !== ctrl) return; // a newer send or Stop replaced this one
    abortRef.current = null;
    if ("aborted" in res) return;
    const clientMs = Math.round(performance.now() - t0);
    if (res.ok) {
      onSuccessRef.current({
        response: res.data,
        note: request.note,
        inputMode: request.input_mode,
        hatTag: request.hat_tag,
        clientMs,
        requestId,
      });
      dispatchRef.current({ type: "RESPONSE_OK" });
    } else {
      dispatchRef.current({
        type: "RESPONSE_ERR",
        error: { code: res.error.code, message: res.error.message, requestId: res.error.requestId, runId: res.error.runId },
      });
    }
  }, []);

  const runEffects = useCallback(
    (effects: Effect[], s: ComposerState) => {
      for (const fx of effects) {
        switch (fx.type) {
          case "start":
            speech.start(fx.lang);
            break;
          case "stop":
            speech.stop();
            break;
          case "abort":
            speech.abort();
            break;
          case "send":
            void send(fx.request, fx.requestId);
            break;
          case "abortRequest":
            abortRef.current?.abort();
            abortRef.current = null;
            break;
          case "toast":
            toast.show({ kind: fx.kind, message: fx.message });
            break;
          case "log": {
            const requestId = s.phase.kind === "sending" || s.phase.kind === "failed" ? s.phase.requestId : undefined;
            const payload = fx.action === "voice.error" ? { ...fx.payload, browser: browserName() } : fx.payload;
            const ctx = { payload, request_id: requestId, hat_code: s.hatTag ?? undefined };
            if (fx.level === "error") log.error(fx.action, null, ctx);
            else if (fx.level === "warn") log.warn(fx.action, ctx);
            else log.info(fx.action, ctx);
            break;
          }
          case "focusTextarea":
            focusTextarea();
            break;
          case "setExplained":
            writeStorage(EXPLAINED_KEY, "1");
            break;
          case "persistLang":
            writeStorage(LANG_KEY, fx.lang);
            break;
        }
      }
    },
    [focusTextarea, send, speech, toast],
  );

  const runEffectsRef = useRef(runEffects);
  useEffect(() => {
    runEffectsRef.current = runEffects;
  });

  // Stable identity, so timers below are not reset on every render.
  const dispatch = useCallback((e: ComposerEvent) => {
    const prev = stateRef.current;
    const { state: next, effects } = transition(prev, e);
    // A stopped send's log uses the request id of the run that was stopped.
    const logState = e.type === "STOP_RUN" ? prev : next;
    stateRef.current = next;
    if (next !== prev) setState(next);
    runEffectsRef.current(effects, logState);
  }, []);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  // Browser capabilities and saved preferences (client only).
  useEffect(() => {
    const lang = readStorage(LANG_KEY);
    const explained = readStorage(EXPLAINED_KEY) === "1";
    const next: ComposerState = {
      ...stateRef.current,
      lang: lang === "en-US" || lang === "es-EC" ? (lang as Lang) : stateRef.current.lang,
      explained,
      supported: isVoiceSupported(),
      typing: !isVoiceSupported(),
    };
    stateRef.current = next;
    setState(next);
  }, []);

  const permReady = useMicPermission((perm, via) => {
    dispatch({ type: "PERM_CHANGE", perm });
    log.info("voice.permission", { payload: { state: perm, via } });
  });

  // Recording clock: timer display, 2:00 cap and 8 s silence detection.
  const recording = state.phase.kind === "recording";
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => dispatch({ type: "TICK", now: Date.now() }), 250);
    return () => clearInterval(id);
  }, [recording, dispatch]);

  // Timed progress steps while sending (D13).
  const sendingId = state.phase.kind === "sending" ? state.phase.requestId : null;
  useEffect(() => {
    if (!sendingId) return;
    const timers = STEP_DELAYS_MS.slice(1).map((ms) => setTimeout(() => dispatch({ type: "STEP_TICK" }), ms));
    return () => timers.forEach(clearTimeout);
  }, [sendingId, dispatch]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const api = {
    micDown: () => dispatch({ type: "MIC_DOWN", now: Date.now() }),
    micClick: () => dispatch({ type: "MIC_CLICK", now: Date.now() }),
    micUp: (heldMs: number) => dispatch({ type: "MIC_UP", now: Date.now(), heldMs }),
    stop: () => dispatch({ type: "STOP", now: Date.now() }),
    cancel: (reason: "slide" | "button" | "esc") => dispatch({ type: "CANCEL", now: Date.now(), reason }),
    allow: () => dispatch({ type: "ALLOW", now: Date.now() }),
    typeInstead: () => dispatch({ type: "TYPE_INSTEAD" }),
    dismissNotice: () => dispatch({ type: "DISMISS_NOTICE" }),
    tryAgainVoice: () => dispatch({ type: "TRY_AGAIN", now: Date.now(), requestId: newRequestId() }),
    edit: (note: string) => dispatch({ type: "EDIT", note }),
    rerecord: () => dispatch({ type: "RERECORD", now: Date.now() }),
    discard: () => dispatch({ type: "DISCARD" }),
    send: () => dispatch({ type: "SEND", now: Date.now(), requestId: newRequestId() }),
    retry: () => dispatch({ type: "TRY_AGAIN", now: Date.now(), requestId: newRequestId() }),
    stopRun: () => dispatch({ type: "STOP_RUN", now: Date.now() }),
    toggleLang: () => dispatch({ type: "LANG_TOGGLE" }),
    setTyping: (typing: boolean) => dispatch({ type: "SET_TYPING", typing }),
    setHat: (hatTag: string | null) => dispatch({ type: "SET_HAT", hatTag }),
    focusTextarea,
  };

  return { state, permReady, ...api };
}

export type ComposerApi = ReturnType<typeof useComposer>;
