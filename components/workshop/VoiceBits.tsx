"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { COPY, type Lang } from "@/lib/voice/reducer";
import type { Word } from "@/lib/voice/words";

/** Tinted notice card: icon, text, actions (handoff "Permission and error notices"). */
export function VoiceNotice({
  tone,
  icon,
  children,
  actions,
}: {
  tone: "info" | "warn" | "err";
  icon: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const tones = {
    info: "bg-info-tint border-info/40 [&_.ni]:text-info",
    warn: "bg-warn-tint border-warn/40 [&_.ni]:text-warn",
    err: "bg-err-tint border-err/40 [&_.ni]:text-err",
  } as const;
  return (
    <div role="status" className={cn("flex gap-2.5 rounded-[12px] border p-3 text-[14px] text-ink", tones[tone])}>
      <Icon name={icon} size={20} className="ni mt-px" />
      <div className="min-w-0 flex-1">
        <p>{children}</p>
        {actions && <div className="mt-2 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const BAR_COUNT = 22;

/** Recording waveform: 22 bars animating scaleY .2 to 1 with staggered delays (off under reduced motion). */
export function Waveform({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-[3px]", className)} aria-hidden>
      <style>{`@keyframes tt-wave{0%,100%{transform:scaleY(.2)}50%{transform:scaleY(1)}}`}</style>
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <span
          key={i}
          className="h-full w-[3px] origin-center rounded-full bg-err"
          style={{ animation: `tt-wave ${0.9 + ((i * 7) % 5) * 0.12}s ease-in-out ${(i % 6) * 0.09}s infinite` }}
        />
      ))}
    </span>
  );
}

export function LangChip({ lang, disabled, onToggle }: { lang: Lang; disabled?: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={`Language: ${lang === "es-EC" ? "Español (Ecuador)" : "English"}. Switch language`}
      className="inline-flex h-9 min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-ink hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
    >
      <Icon name="translate" size={16} className="text-muted" />
      {lang === "es-EC" ? "Español (Ecuador)" : "English"}
    </button>
  );
}

export function HatChip({ code, onClear }: { code: string; onClear: () => void }) {
  return (
    <span className="inline-flex h-9 items-center gap-1 rounded-full bg-info-tint pr-1 pl-3 text-[13px] font-medium text-info">
      About <span className="font-mono">{code}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove hat ${code}`}
        className="grid h-7 w-7 place-items-center rounded-full hover:bg-surface/60 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Icon name="close" size={16} />
      </button>
    </span>
  );
}

/** Live transcript: confirmed words in ink, interim muted, low words with a wavy amber underline. */
export function LiveTranscript({ baseNote, words, className }: { baseNote: string; words: Word[]; className?: string }) {
  return (
    <div
      aria-live="polite"
      aria-label="Live transcript"
      className={cn(
        "min-h-[84px] overflow-y-auto rounded-[12px] border-[1.5px] border-err bg-surface px-3 py-2.5 text-[15px] leading-relaxed",
        className,
      )}
    >
      {baseNote && <span className="text-ink">{baseNote} </span>}
      {words.length === 0 && <span className="text-muted">Listening...</span>}
      {words.map((w, i) => (
        <span key={i}>
          {w.low ? (
            <span
              title={COPY.lowWord}
              className="text-ink underline decoration-warn decoration-wavy decoration-[1.5px] underline-offset-4"
            >
              {w.w}
              <span className="sr-only"> ({COPY.lowWord})</span>
            </span>
          ) : (
            <span className={w.confirmed ? "text-ink" : "text-muted"}>{w.w}</span>
          )}{" "}
        </span>
      ))}
    </div>
  );
}

export function UnsureChips({ words, onPick }: { words: string[]; onPick: (w: string) => void }) {
  if (words.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] text-muted">Not sure I heard these right. Tap to retype:</span>
      {words.map((w) => (
        <button
          key={w}
          type="button"
          onClick={() => onPick(w)}
          className="inline-flex h-9 items-center rounded-full border border-warn/50 bg-warn-tint px-3 text-[13px] font-medium text-warn focus-visible:outline-2 focus-visible:outline-accent"
        >
          {w}
        </button>
      ))}
    </div>
  );
}

export function NoticeTypeInstead({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" icon="keyboard" onClick={onClick}>
      Type instead
    </Button>
  );
}
