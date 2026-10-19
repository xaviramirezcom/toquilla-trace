"use client";

import { useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { SLIDE_CANCEL_PX } from "@/lib/voice/reducer";

export interface MicButtonProps {
  recording: boolean;
  /** Touch / pen: press and hold (release to stop), quick tap toggles. Mouse and keyboard: click toggles. */
  onHoldStart: () => void;
  onHoldEnd: (heldMs: number) => void;
  onToggle: () => void;
  onSlide?: (dx: number) => void;
  onSlideCancel?: () => void;
  label: string;
  size?: number;
  tone?: "accent" | "tint";
  className?: string;
}

/** 72px mic with pulse ring while recording. touch-action none so a long press doesn't select text. */
export function MicButton({
  recording,
  onHoldStart,
  onHoldEnd,
  onToggle,
  onSlide,
  onSlideCancel,
  label,
  size = 72,
  tone = "accent",
  className,
}: MicButtonProps) {
  const down = useRef<{ at: number; x: number; id: number } | null>(null);
  const lastTouchAt = useRef(0);
  const cancelled = useRef(false);

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={recording}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return; // mouse uses click
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        lastTouchAt.current = Date.now();
        down.current = { at: Date.now(), x: e.clientX, id: e.pointerId };
        cancelled.current = false;
        onHoldStart();
      }}
      onPointerMove={(e) => {
        const d = down.current;
        if (!d || d.id !== e.pointerId || cancelled.current) return;
        const dx = Math.min(0, e.clientX - d.x);
        onSlide?.(dx);
        if (dx < -SLIDE_CANCEL_PX) {
          cancelled.current = true;
          down.current = null;
          onSlide?.(0);
          onSlideCancel?.();
        }
      }}
      onPointerUp={(e) => {
        const d = down.current;
        down.current = null;
        onSlide?.(0);
        if (!d || d.id !== e.pointerId || cancelled.current) return;
        onHoldEnd(Date.now() - d.at);
      }}
      onPointerCancel={(e) => {
        const d = down.current;
        down.current = null;
        onSlide?.(0);
        if (d && d.id === e.pointerId && !cancelled.current) onHoldEnd(Date.now() - d.at);
      }}
      onClick={() => {
        // Touch already handled by pointer events; the synthetic click that follows is ignored.
        if (Date.now() - lastTouchAt.current < 800) return;
        onToggle();
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={{ width: size, height: size, touchAction: "none", WebkitTouchCallout: "none" }}
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full select-none",
        "transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        recording
          ? "bg-err text-on-accent"
          : tone === "accent"
            ? "bg-accent text-on-accent hover:bg-accent-strong"
            : "bg-accent-tint text-accent",
        className,
      )}
    >
      {recording && <span className="absolute inset-0 animate-ping rounded-full bg-err/40" aria-hidden />}
      <Icon name={recording ? "stop" : "mic"} size={Math.round(size * 0.42)} filled={recording} className="relative" />
    </button>
  );
}
