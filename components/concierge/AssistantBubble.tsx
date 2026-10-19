"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { log } from "@/lib/log";
import type { Pill } from "@/lib/passport/concierge";
import { AssistantAvatar, SourcePill } from "./parts";

export interface AssistantMsg {
  id: string;
  role: "assistant";
  kind: "answer" | "unknown" | "refused" | "error";
  text: string;
  pills: Pill[];
}

export interface AssistantBubbleProps {
  msg: AssistantMsg;
  code: string;
  contactHref: string | null;
  showClaim: boolean;
  onClaim: () => void;
  onRetry: () => void;
  retryDisabled: boolean;
}

/** Assistant bubble: text, source pills, Copy / Helpful / Not helpful, and the special-reply actions. */
export function AssistantBubble({ msg, code, contactHref, showClaim, onClaim, onRetry, retryDisabled }: AssistantBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [what, setWhat] = useState("");
  const [sent, setSent] = useState(false);
  const hasTools = msg.kind === "answer";

  async function copy() {
    try {
      await navigator.clipboard.writeText(msg.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; nothing else to do.
    }
  }

  function feedback(helpful: boolean, reason: string | null) {
    // Signed-in viewers get an app_logs row; anonymous feedback is dropped by the logger (log_public allowlist, D6).
    log.info("concierge.message", { hat_code: code, payload: { event: "feedback", helpful, reason } });
  }

  function toggle(v: "up" | "down") {
    const next = vote === v ? null : v;
    setVote(next);
    setSent(false);
    if (next === "up") feedback(true, null);
  }

  return (
    <div className="flex max-w-[92%] gap-2 animate-enter">
      <AssistantAvatar />
      <div className="flex min-w-0 flex-col gap-1.5">
        <div
          className={cn(
            "rounded-[4px_14px_14px_14px] border px-3 py-2.5 break-words whitespace-pre-wrap",
            msg.kind === "error" ? "border-err bg-err-tint" : "border-line bg-surface",
          )}
        >
          {msg.text}
          {msg.kind === "error" && (
            <>
              {" "}
              <button
                type="button"
                onClick={onRetry}
                disabled={retryDisabled}
                className="font-bold text-accent disabled:opacity-45"
              >
                Try again
              </button>
            </>
          )}
          {msg.kind === "unknown" && contactHref && (
            <div className="mt-1.5">
              <a href={contactHref} className="font-semibold text-accent underline-offset-2 hover:underline">
                Contact the workshop
              </a>
            </div>
          )}
          {msg.kind === "refused" && showClaim && (
            <div className="mt-2">
              <button
                type="button"
                onClick={onClaim}
                className="h-9 rounded-[9px] bg-accent px-3.5 font-semibold text-on-accent hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Claim this hat
              </button>
            </div>
          )}
        </div>
        {msg.pills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {msg.pills.map((p) => (
              <SourcePill key={p.label} pill={p} />
            ))}
          </div>
        )}
        {hasTools && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={copy}
              aria-label={copied ? "Copied!" : "Copy"}
              title={copied ? "Copied!" : "Copy"}
              className="grid h-8 w-8 place-items-center rounded-[8px] text-muted hover:bg-surface2"
            >
              <Icon name={copied ? "check" : "content_copy"} size={17} />
            </button>
            <button
              type="button"
              onClick={() => toggle("up")}
              aria-label="Helpful"
              aria-pressed={vote === "up"}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-[8px] hover:bg-surface2",
                vote === "up" ? "bg-accent-tint text-accent" : "text-muted",
              )}
            >
              <Icon name="thumb_up" size={17} filled={vote === "up"} />
            </button>
            <button
              type="button"
              onClick={() => toggle("down")}
              aria-label="Not helpful"
              aria-pressed={vote === "down"}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-[8px] hover:bg-surface2",
                vote === "down" ? "bg-err-tint text-err" : "text-muted",
              )}
            >
              <Icon name="thumb_down" size={17} filled={vote === "down"} />
            </button>
            {copied && <span className="ml-1 text-xs text-muted">Copied!</span>}
          </div>
        )}
        {vote === "down" && !sent && (
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              feedback(false, what.trim() || null);
              setSent(true);
            }}
          >
            <input
              value={what}
              onChange={(e) => setWhat(e.target.value.slice(0, 200))}
              maxLength={200}
              placeholder="What was wrong?"
              aria-label="What was wrong?"
              className="h-9 min-w-0 flex-1 rounded-[9px] border border-line bg-surface px-2.5 text-base outline-none focus:border-accent md:text-sm"
            />
            <button type="submit" className="h-9 rounded-[9px] bg-accent px-3 font-semibold text-on-accent hover:bg-accent-strong">
              Send
            </button>
          </form>
        )}
        {sent && <span className="text-xs text-muted">Thanks, that helps.</span>}
      </div>
    </div>
  );
}
