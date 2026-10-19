"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

export type ToastKind = "success" | "info" | "warning" | "error" | "undo";

export interface ToastOptions {
  kind?: ToastKind;
  message: string;
  /** Optional action button, e.g. { label: "View log", onClick }. Clicking it closes the toast. */
  action?: { label: string; onClick: () => void };
  /** Auto-dismiss after this many ms. Default 5000, or 10000 for "undo". */
  durationMs?: number;
}

export interface UndoToastOptions {
  /** Called when the user presses Undo (the pending action must be cancelled). */
  onUndo: () => void;
  /** Called when the countdown ends without Undo, or the toast is closed with ×. */
  onExpire?: () => void;
  durationMs?: number;
}

export interface ToastApi {
  show(opts: ToastOptions): string;
  success(message: string, opts?: Omit<ToastOptions, "message" | "kind">): string;
  info(message: string, opts?: Omit<ToastOptions, "message" | "kind">): string;
  warning(message: string, opts?: Omit<ToastOptions, "message" | "kind">): string;
  error(message: string, opts?: Omit<ToastOptions, "message" | "kind">): string;
  /** 10 s toast with an Undo button and a countdown bar (D14). It does not pause on hover. */
  undo(message: string, opts: UndoToastOptions): string;
  dismiss(id: string): void;
}

interface ToastItem extends ToastOptions {
  id: string;
  kind: ToastKind;
  durationMs: number;
  onUndo?: () => void;
  onExpire?: () => void;
}

const MAX_TOASTS = 3;

const ToastContext = createContext<ToastApi | null>(null);

const kindIcon: Record<ToastKind, { name: string; color: string }> = {
  success: { name: "check_circle", color: "text-ok" },
  info: { name: "info", color: "text-info" },
  warning: { name: "warning", color: "text-warn" },
  error: { name: "error", color: "text-err" },
  undo: { name: "undo", color: "text-accent" },
};

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const listRef = useRef<ToastItem[]>([]);

  const commit = useCallback((next: ToastItem[]) => {
    listRef.current = next;
    setToasts(next);
  }, []);

  const dismiss = useCallback((id: string) => commit(listRef.current.filter((t) => t.id !== id)), [commit]);

  const show = useCallback(
    (opts: ToastOptions & Pick<ToastItem, "onUndo" | "onExpire">) => {
      counter += 1;
      const id = `toast_${counter}`;
      const kind = opts.kind ?? "info";
      const item: ToastItem = { ...opts, id, kind, durationMs: opts.durationMs ?? (kind === "undo" ? 10_000 : 5000) };
      const next = [...listRef.current, item];
      // Max 3 stacked: the oldest leaves first. An evicted undo toast commits its action.
      const evicted = next.splice(0, Math.max(0, next.length - MAX_TOASTS));
      commit(next);
      for (const t of evicted) t.onExpire?.();
      return id;
    },
    [commit],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show: (o) => show(o),
      success: (message, o) => show({ ...o, message, kind: "success" }),
      info: (message, o) => show({ ...o, message, kind: "info" }),
      warning: (message, o) => show({ ...o, message, kind: "warning" }),
      error: (message, o) => show({ ...o, message, kind: "error" }),
      undo: (message, o) =>
        show({ message, kind: "undo", durationMs: o.durationMs, onUndo: o.onUndo, onExpire: o.onExpire }),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className={cn(
          "pointer-events-none fixed z-[60] flex flex-col gap-2",
          "inset-x-4 top-4 items-center",
          "md:inset-x-auto md:top-auto md:right-6 md:bottom-6 md:w-[380px] md:items-stretch",
        )}
      >
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} onDone={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDone }: { toast: ToastItem; onDone: (id: string) => void }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.durationMs);
  const startedAt = useRef(0);
  const settled = useRef(false);
  const pausable = toast.kind !== "undo";

  const finish = useCallback(
    (how: "expire" | "undo" | "close" | "action") => {
      if (settled.current) return;
      settled.current = true;
      if (how === "undo") toast.onUndo?.();
      else toast.onExpire?.();
      onDone(toast.id);
    },
    [toast, onDone],
  );

  useEffect(() => {
    if (paused && pausable) return;
    startedAt.current = Date.now();
    const timer = setTimeout(() => finish("expire"), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [paused, pausable, finish]);

  const icon = kindIcon[toast.kind];
  return (
    <div
      // The container is the polite live region; only errors add role="alert" (no double announcement).
      role={toast.kind === "error" ? "alert" : undefined}
      // Pause while pointed at or while focus is inside (keyboard users tabbing to a button).
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
      className="pointer-events-auto relative flex w-full max-w-[380px] items-center gap-3 overflow-hidden rounded-[12px] bg-ink py-3 pr-2 pl-4 text-bg shadow-card animate-enter"
    >
      <Icon name={icon.name} size={20} className={icon.color} />
      <p className="min-w-0 flex-1 text-[13px] leading-snug">{toast.message}</p>
      {toast.kind === "undo" && (
        <button
          type="button"
          onClick={() => finish("undo")}
          className="rounded-[8px] px-2.5 py-1.5 text-[13px] font-semibold text-accent-tint hover:bg-white/10"
        >
          Undo
        </button>
      )}
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            finish("action");
          }}
          className="rounded-[8px] px-2.5 py-1.5 text-[13px] font-semibold hover:bg-white/10"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => finish("close")}
        className="grid h-8 w-8 place-items-center rounded-[8px] opacity-70 hover:bg-white/10 hover:opacity-100"
      >
        <Icon name="close" size={18} />
      </button>
      {toast.kind === "undo" && (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-accent"
          style={{ animation: `tt-countdown ${toast.durationMs}ms linear forwards` }}
        />
      )}
    </div>
  );
}

/** Toasts from any client component under <ToastProvider> (mounted in app/layout.tsx). */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
