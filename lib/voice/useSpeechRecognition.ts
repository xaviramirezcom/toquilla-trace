"use client";

// Thin wrapper over the browser Web Speech API (spec 02 "Speech hook"). It owns the recognizer
// object and forwards results and errors as plain callbacks; all decisions live in the reducer.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "./reducer";
import { toWords, type SpeechResultListLike, type Word } from "./words";

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: SpeechResultListLike }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => RecognitionLike;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isVoiceSupported(): boolean {
  return getCtor() !== null;
}

export function browserName(): "chrome" | "safari" | "firefox" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/firefox/i.test(ua)) return "firefox";
  if (/chrome|crios|edg/i.test(ua)) return "chrome";
  if (/safari/i.test(ua)) return "safari";
  return "other";
}

export interface SpeechHandlers {
  onWords: (words: Word[]) => void;
  onError: (code: string) => void;
  onEnd: () => void;
}

export interface SpeechApi {
  /** Must be called inside a pointer or click handler (iOS needs a user gesture). */
  start: (lang: Lang) => void;
  /** Graceful stop: final results still arrive. */
  stop: () => void;
  /** Hard stop: drop pending results. */
  abort: () => void;
}

export function useSpeechRecognition(handlers: SpeechHandlers): SpeechApi {
  const recRef = useRef<RecognitionLike | null>(null);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const detach = useCallback((rec: RecognitionLike | null) => {
    if (!rec) return;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
  }, []);

  const start = useCallback(
    (lang: Lang) => {
      const Ctor = getCtor();
      if (!Ctor) {
        handlersRef.current.onError("service-not-allowed");
        return;
      }
      if (recRef.current) {
        detach(recRef.current);
        try {
          recRef.current.abort();
        } catch {
          // already stopped
        }
      }
      const rec = new Ctor();
      rec.lang = lang;
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => handlersRef.current.onWords(toWords(e.results));
      rec.onerror = (e) => handlersRef.current.onError(e.error);
      rec.onend = () => {
        if (recRef.current === rec) recRef.current = null;
        handlersRef.current.onEnd();
      };
      recRef.current = rec;
      try {
        rec.start();
      } catch {
        recRef.current = null;
        handlersRef.current.onError("service-not-allowed");
      }
    },
    [detach],
  );

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    // Results from a graceful stop are no longer needed: the reducer already moved to review.
    detach(rec);
    recRef.current = null;
    try {
      rec.stop();
    } catch {
      // ignore
    }
  }, [detach]);

  const abort = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    detach(rec);
    recRef.current = null;
    try {
      rec.abort();
    } catch {
      // ignore
    }
  }, [detach]);

  useEffect(() => () => abort(), [abort]);

  return { start, stop, abort };
}

/** Microphone permission via the Permissions API (Nice). Firefox and old Safari throw: "unknown". */
export function useMicPermission(onChange: (state: "granted" | "prompt" | "denied" | "unknown", via: "query" | "change") => void) {
  const [ready, setReady] = useState(false);
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });
  useEffect(() => {
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const handler = () => {
      if (status) cb.current(status.state as "granted" | "prompt" | "denied", "change");
    };
    (async () => {
      try {
        if (!navigator.permissions?.query) throw new Error("no permissions api");
        status = await navigator.permissions.query({ name: "microphone" as PermissionName });
        if (cancelled) return;
        cb.current(status.state as "granted" | "prompt" | "denied", "query");
        status.addEventListener("change", handler);
      } catch {
        if (!cancelled) cb.current("unknown", "query");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      status?.removeEventListener("change", handler);
    };
  }, []);
  return ready;
}
