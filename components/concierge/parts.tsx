"use client";

// Small presentational pieces of the concierge chat (spec 07 section 4).
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { counterText, limitText, MAX_QUESTION_CHARS, type LimitKind, type Pill } from "@/lib/passport/concierge";

export function AssistantAvatar() {
  return (
    <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-tint text-accent">
      <Icon name="auto_awesome" size={16} />
    </span>
  );
}

export function SourcePill({ pill }: { pill: Pill }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-semibold",
        pill.tone === "record" ? "bg-ok-tint text-ok" : "bg-surface2 text-muted",
      )}
    >
      <Icon name={pill.icon} size={14} />
      {pill.label}
    </span>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 text-[13px] text-muted" role="status">
      <AssistantAvatar />
      <span className="flex items-center gap-1" aria-hidden>
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted motion-reduce:animate-none"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </span>
      Checking the record...
    </div>
  );
}

export function Suggestions({ items, onPick }: { items: string[]; onPick: (q: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pl-9" aria-label="Suggested questions" role="group">
      {items.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onPick(q)}
          className="min-h-11 rounded-full border border-line bg-surface px-3 text-[13px] hover:border-accent hover:bg-accent-tint focus-visible:outline-2 focus-visible:outline-accent"
        >
          {q}
        </button>
      ))}
    </div>
  );
}

export interface RateLimitBannerProps {
  kind: LimitKind;
  waitMs: number;
  onNewChat: () => void;
}

/** Per-chat cap: start a new chat. Server 429: wait (the panel clears the banner when the time is up). */
export function RateLimitBanner({ kind, waitMs, onNewChat }: RateLimitBannerProps) {
  return (
    <div
      role="status"
      className="mx-4 mb-2 flex items-center gap-2 rounded-[10px] border border-warn bg-warn-tint px-3 py-2 text-[13px]"
    >
      <Icon name="hourglass_top" size={18} className="text-warn" />
      <span className="flex-1">{limitText(kind, waitMs)}</span>
      {kind === "chat" && (
        <button
          type="button"
          onClick={onNewChat}
          className="h-11 shrink-0 rounded-[10px] border border-line bg-surface px-3 font-semibold hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent"
        >
          New chat
        </button>
      )}
    </div>
  );
}

export interface ComposerProps {
  disabled: boolean;
  busy: boolean;
  onSend: (text: string) => void;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

/** Textarea 1 to 4 lines, max 300 chars, counter after 250. Enter sends, Shift+Enter adds a line. */
export function Composer({ disabled, busy, onSend, inputRef }: ComposerProps) {
  const [text, setText] = useState("");
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? localRef;
  const counter = counterText(text.length);
  const canSend = !disabled && !busy && text.trim().length > 0;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const line = 20;
    el.style.height = `${Math.min(el.scrollHeight, line * 4 + 22)}px`;
  }, [text, ref]);

  function send() {
    if (!canSend) return;
    onSend(text.trim());
    setText("");
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-line px-4 pt-2.5 pb-3.5">
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_QUESTION_CHARS))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          disabled={disabled}
          rows={1}
          maxLength={MAX_QUESTION_CHARS}
          placeholder="Ask a question..."
          aria-label="Ask a question"
          className="min-w-0 flex-1 resize-none rounded-[12px] border border-line bg-surface px-3 py-2.5 text-base leading-5 outline-none focus:border-accent focus:ring-3 focus:ring-accent-tint disabled:bg-surface2 md:text-sm"
        />
        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          aria-label="Send"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-accent text-on-accent hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Icon name="send" />
        </button>
      </div>
      <div className="flex justify-between gap-2 text-[11.5px] text-muted">
        <span>AI answers can be wrong. The verified record above is the source of truth.</span>
        {counter && (
          <span className="shrink-0 font-mono" aria-live="polite">
            {counter}
          </span>
        )}
      </div>
    </div>
  );
}
