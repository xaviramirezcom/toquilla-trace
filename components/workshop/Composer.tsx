"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  COPY,
  NOTE_MAX,
  NOTE_WARN,
  RECORDING_AMBER_MS,
  SLIDE_WARN_PX,
  canSendNote,
  counterTone,
  formatTimer,
} from "@/lib/voice/reducer";
import { lowWordsInNote } from "@/lib/voice/words";
import { AgentFailedCard, AgentSteps } from "./AgentRun";
import { MicButton } from "./MicButton";
import type { ComposerApi } from "./useComposer";
import { HatChip, LangChip, LiveTranscript, NoticeTypeInstead, UnsureChips, VoiceNotice, Waveform } from "./VoiceBits";

export const EXAMPLES = [
  {
    label: "Rosa's 3 finos, TQ-7F3K2, TQ-2C5P0",
    text: "Doña Rosa terminó 3 finos de 18 hileras. El TQ-7F3K2 ya está lavado, pasa a blanqueo. El TQ-2C5P0 ya está listo. Y el de Carmen dice superfino pero tiene 18 hileras.",
  },
  { label: "TQ-7F3K2 to bleaching", text: "El TQ-7F3K2 ya está lavado, pasa a blanqueo." },
  { label: "Check Carmen's grade", text: "El de Carmen dice superfino pero tiene 18 hileras." },
] as const;

const PLACEHOLDERS = [
  "Doña Rosa terminó 3 finos de 18 hileras.",
  "El TQ-7F3K2 ya está lavado, pasa a blanqueo.",
  "El de Carmen dice superfino pero tiene 18 hileras.",
];

const HOW_TO_ALLOW =
  "https://support.google.com/chrome/answer/2693767";

function usePlaceholder(active: boolean): string {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setI((x) => (x + 1) % PLACEHOLDERS.length), 4000);
    return () => clearInterval(id);
  }, [active]);
  return PLACEHOLDERS[i];
}

function Counter({ length, onlyAboveWarn }: { length: number; onlyAboveWarn?: boolean }) {
  if (onlyAboveWarn && length <= NOTE_WARN) return null;
  const tone = counterTone(length);
  return (
    <span
      className={cn("font-mono text-[12px]", tone === "err" ? "text-err" : tone === "warn" ? "text-warn" : "text-muted")}
      aria-label={`${length} of ${NOTE_MAX} characters`}
    >
      {length} / {NOTE_MAX}
    </span>
  );
}

function selectWord(el: HTMLTextAreaElement | null, word: string) {
  if (!el) return;
  const i = el.value.indexOf(word);
  el.focus();
  if (i >= 0) el.setSelectionRange(i, i + word.length);
}

interface NoteBoxProps {
  c: ComposerApi;
  variant: "card" | "dock";
  placeholder: string;
  className?: string;
  autoFocus?: boolean;
}

function NoteBox({ c, variant, placeholder, className }: NoteBoxProps) {
  const s = c.state;
  const sending = s.phase.kind === "sending";
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (s.phase.kind === "failed") c.retry();
      else c.send();
    }
  }
  return (
    <textarea
      id={`composer-note-${variant}`}
      aria-label="Your note"
      value={s.note}
      readOnly={sending}
      onChange={(e) => c.edit(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      rows={variant === "card" ? 3 : 1}
      className={cn(
        "w-full resize-none bg-surface text-[15px] text-ink outline-none placeholder:text-muted",
        "[field-sizing:content]",
        variant === "card"
          ? "max-h-[calc(8lh+24px)] min-h-[calc(3lh+24px)] rounded-[12px] border border-line px-3 py-3 focus:border-accent focus:ring-[3px] focus:ring-accent-tint"
          : "max-h-[calc(5lh+20px)] min-h-12 rounded-[24px] border border-line px-4 py-3 focus:border-accent",
        sending && "opacity-55",
        className,
      )}
    />
  );
}

function Notices({ c, variant }: { c: ComposerApi; variant: "card" | "dock" }) {
  const s = c.state;
  const p = s.phase;
  if (!s.supported && (p.kind === "idle" || p.kind === "failed")) {
    return (
      <VoiceNotice tone="info" icon="mic_off">
        {COPY.unsupported}
      </VoiceNotice>
    );
  }
  if (p.kind === "explaining") {
    return (
      <VoiceNotice
        tone="info"
        icon="mic"
        actions={
          <>
            <Button size="sm" icon="mic" onClick={c.allow}>
              Allow microphone
            </Button>
            <NoticeTypeInstead onClick={c.typeInstead} />
          </>
        }
      >
        {COPY.firstUse}
      </VoiceNotice>
    );
  }
  if (p.kind === "blocked") {
    return (
      <VoiceNotice
        tone="err"
        icon="mic_off"
        actions={
          <>
            <a
              href={HOW_TO_ALLOW}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center rounded-[10px] px-2 text-[13px] font-semibold text-accent hover:bg-accent-tint"
            >
              How to allow
            </a>
            <NoticeTypeInstead onClick={c.typeInstead} />
          </>
        }
      >
        {COPY.blocked}
      </VoiceNotice>
    );
  }
  if (p.kind === "silence") {
    return (
      <VoiceNotice
        tone="warn"
        icon="hearing_disabled"
        actions={
          <>
            <Button size="sm" icon="mic" onClick={c.tryAgainVoice}>
              Try again
            </Button>
            <NoticeTypeInstead onClick={c.typeInstead} />
          </>
        }
      >
        {COPY.silence}
      </VoiceNotice>
    );
  }
  if (p.kind === "review" && p.lost) {
    return (
      <VoiceNotice tone="warn" icon="wifi_off">
        {COPY.lost}
      </VoiceNotice>
    );
  }
  void variant;
  return null;
}

/** Desktop card. */
export function ComposerCard({ c, isAdmin }: { c: ComposerApi; isAdmin: boolean }) {
  const s = c.state;
  const p = s.phase;
  const placeholder = usePlaceholder(p.kind === "idle" && !s.note);
  const busy = p.kind === "recording" || p.kind === "sending";
  const hasText = s.note.trim().length > 0;

  return (
    <section aria-labelledby="composer-title" className="rounded-[16px] border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="composer-title" className="flex items-center gap-2 text-[18px] font-semibold text-ink">
            <Icon name="graphic_eq" size={22} className="text-accent" />
            Just tell me what happened
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">Hold the mic and talk, like a WhatsApp voice note.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {s.hatTag && <HatChip code={s.hatTag} onClear={() => c.setHat(null)} />}
          {s.supported && <LangChip lang={s.lang} disabled={busy} onToggle={c.toggleLang} />}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <Notices c={c} variant="card" />

        {p.kind === "recording" ? (
          <>
            <LiveTranscript baseNote={p.baseNote} words={p.words} className="max-h-[240px]" />
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-err">
                <span className="h-2 w-2 animate-pulse rounded-full bg-err" aria-hidden />
                Recording
              </span>
              <Waveform />
              <span
                className={cn("font-mono text-[14px]", p.elapsedMs >= RECORDING_AMBER_MS ? "text-warn" : "text-ink")}
                aria-label={`Recording time ${formatTimer(p.elapsedMs)}, up to 2 minutes`}
              >
                {formatTimer(p.elapsedMs)}
              </span>
              <span className="text-[12px] text-muted">Up to 2 minutes</span>
              <div className="ml-auto flex items-center gap-3">
                <Button variant="ghost" onClick={() => c.cancel("button")}>
                  Cancel
                </Button>
                <div className="flex flex-col items-center gap-1">
                  <MicButton
                    recording
                    onHoldStart={c.micDown}
                    onHoldEnd={c.micUp}
                    onToggle={c.micClick}
                    label="Click to stop"
                  />
                  <span className="text-[12px] text-muted">Click to stop</span>
                </div>
              </div>
            </div>
          </>
        ) : p.kind === "review" ? (
          <>
            <p className="text-[13px] font-semibold text-ink">Check the transcript, then send.</p>
            <NoteBox c={c} variant="card" placeholder="" />
            <UnsureChips
              words={lowWordsInNote(p.lowWords, s.note)}
              onPick={(w) => selectWord(document.getElementById("composer-note-card") as HTMLTextAreaElement | null, w)}
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Counter length={s.note.length} />
              <Button variant="ghost" icon="delete" onClick={c.discard}>
                Discard
              </Button>
              <Button variant="secondary" icon="mic" onClick={c.rerecord}>
                Re-record
              </Button>
              <Button icon="send" onClick={c.send} disabled={!canSendNote(s.note)}>
                Send
              </Button>
            </div>
          </>
        ) : (
          <>
            <NoteBox c={c} variant="card" placeholder={placeholder} />
            {p.kind === "idle" && !hasText && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] text-muted">Or try an example:</span>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.label}
                    type="button"
                    onClick={() => {
                      c.edit(ex.text);
                      c.focusTextarea();
                    }}
                    className="inline-flex h-9 items-center rounded-full border border-line bg-surface px-3 text-[13px] text-ink hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            )}
            {p.kind === "sending" && <AgentSteps step={p.step} onStop={c.stopRun} />}
            {p.kind === "failed" && (
              <AgentFailedCard error={p.error} requestId={p.requestId} isAdmin={isAdmin} onRetry={c.retry} />
            )}
            {p.kind !== "sending" && (
              <div className="flex flex-wrap items-center gap-3">
                <span title="Photos are coming soon.">
                  <Button variant="ghost" size="icon" icon="attach_file" disabled aria-label="Attach photo. Photos are coming soon." />
                </span>
                <Counter length={s.note.length} />
                <div className="ml-auto flex items-center gap-3">
                  {s.supported && (
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-muted">Click to talk</span>
                      <MicButton
                        recording={false}
                        onHoldStart={c.micDown}
                        onHoldEnd={c.micUp}
                        onToggle={c.micClick}
                        label="Click to talk"
                      />
                    </div>
                  )}
                  <Button
                    icon="send"
                    variant={hasText ? "primary" : "secondary"}
                    onClick={p.kind === "failed" ? c.retry : c.send}
                    disabled={!canSendNote(s.note)}
                    title="Send (Ctrl or Cmd + Enter)"
                  >
                    Send
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** Mobile dock, above the 64px tab bar. */
export function ComposerDock({ c, isAdmin, onClose }: { c: ComposerApi; isAdmin: boolean; onClose?: () => void }) {
  const s = c.state;
  const p = s.phase;
  const [dx, setDx] = useState(0);
  const typing = s.typing || !s.supported;

  return (
    <div className="flex flex-col gap-3">
      <Notices c={c} variant="dock" />

      {p.kind === "recording" ? (
        <>
          <LiveTranscript baseNote={p.baseNote} words={p.words} className="max-h-[112px] min-h-[64px]" />
          <div className="flex items-center justify-center gap-3">
            <span
              className={cn("font-mono text-[14px]", p.elapsedMs >= RECORDING_AMBER_MS ? "text-warn" : "text-ink")}
              aria-label={`Recording time ${formatTimer(p.elapsedMs)}, up to 2 minutes`}
            >
              {formatTimer(p.elapsedMs)}
            </span>
            <Waveform />
            <span className="text-[12px] text-muted">Up to 2 minutes</span>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="justify-self-start">
              {p.mode === "hold" ? (
                <span
                  className={cn("text-[13px] font-medium transition-colors", dx < -SLIDE_WARN_PX ? "text-err" : "text-muted")}
                  style={{ transform: `translateX(${dx}px)` }}
                  aria-hidden
                >
                  ‹ Slide to cancel
                </span>
              ) : (
                <Button variant="ghost" onClick={() => c.cancel("button")}>
                  Cancel
                </Button>
              )}
            </div>
            <MicButton
              recording
              onHoldStart={c.micDown}
              onHoldEnd={c.micUp}
              onToggle={c.micClick}
              onSlide={setDx}
              onSlideCancel={() => c.cancel("slide")}
              label={p.mode === "hold" ? "Release to stop" : "Tap to stop"}
            />
            <span className="justify-self-end text-[13px] text-muted">{p.mode === "hold" ? "Release to stop" : "Tap to stop"}</span>
          </div>
        </>
      ) : p.kind === "review" ? (
        <>
          <p className="text-[13px] font-semibold text-ink">Check the transcript, then send.</p>
          <NoteBox c={c} variant="dock" placeholder="" />
          <UnsureChips
            words={lowWordsInNote(p.lowWords, s.note)}
            onPick={(w) => selectWord(document.getElementById("composer-note-dock") as HTMLTextAreaElement | null, w)}
          />
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="icon" icon="delete" aria-label="Discard" onClick={c.discard} className="h-12 w-12" />
            <Button variant="secondary" icon="mic" onClick={c.rerecord} className="h-12">
              Re-record
            </Button>
            <Button icon="send" onClick={c.send} disabled={!canSendNote(s.note)} className="h-12 flex-1">
              Send
            </Button>
          </div>
        </>
      ) : p.kind === "sending" || p.kind === "failed" || typing ? (
        <>
          {p.kind === "failed" && (
            <AgentFailedCard error={p.error} requestId={p.requestId} isAdmin={isAdmin} onRetry={c.retry} />
          )}
          {p.kind === "sending" && <AgentSteps step={p.step} onStop={c.stopRun} />}
          <div className="flex items-end gap-2">
            {s.supported && p.kind !== "sending" && (
              <MicButton
                recording={false}
                size={48}
                tone="tint"
                onHoldStart={c.micDown}
                onHoldEnd={c.micUp}
                onToggle={c.micClick}
                label="Back to voice"
              />
            )}
            <NoteBox c={c} variant="dock" placeholder="Type what happened..." className="flex-1" />
            <Button
              size="icon"
              icon="send"
              aria-label="Send"
              onClick={p.kind === "failed" ? c.retry : c.send}
              disabled={!canSendNote(s.note) || p.kind === "sending"}
              className="h-12 w-12 shrink-0 rounded-full"
            />
          </div>
          <div className="flex items-center justify-between">
            <Counter length={s.note.length} onlyAboveWarn />
            {s.supported && p.kind !== "sending" && s.typing && (
              <button type="button" onClick={() => c.setTyping(false)} className="ml-auto min-h-11 px-2 text-[13px] font-medium text-accent">
                Use voice
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="justify-self-start">
            {s.hatTag ? (
              <HatChip code={s.hatTag} onClear={() => c.setHat(null)} />
            ) : onClose ? (
              <Button variant="ghost" size="icon" icon="expand_more" aria-label="Back to proposals" onClick={onClose} />
            ) : null}
          </div>
          <div className="flex flex-col items-center gap-1">
            <MicButton recording={false} onHoldStart={c.micDown} onHoldEnd={c.micUp} onToggle={c.micClick} label="Hold to talk" />
            <span className="text-[12px] font-medium text-ink">Hold to talk</span>
            <button
              type="button"
              onClick={() => c.setTyping(true)}
              className="min-h-11 px-2 text-[13px] font-medium text-accent"
            >
              <span aria-hidden>⌨ </span>Type instead
            </button>
          </div>
          <div className="justify-self-end">
            <LangChip lang={s.lang} onToggle={c.toggleLang} />
          </div>
        </div>
      )}
    </div>
  );
}
