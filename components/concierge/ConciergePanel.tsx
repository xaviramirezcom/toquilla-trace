"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  answerKind,
  buildRequestMessages,
  contactHref as mailto,
  MAX_USER_TURNS,
  nextSuggestions,
  pillsFor,
  startSuggestions,
} from "@/lib/passport/concierge";
import type { ChatTurn, ClaimMode } from "@/lib/passport/types";
import { askConcierge } from "./askConcierge";
import { AssistantBubble, type AssistantMsg } from "./AssistantBubble";
import { AssistantAvatar, Composer, RateLimitBanner, Suggestions, TypingIndicator } from "./parts";

interface UserMsg {
  id: string;
  role: "user";
  text: string;
  /** ok = answered (counts toward the 8-question limit), failed = error or rate limit, pending = in flight. */
  status: "pending" | "ok" | "failed";
}

type Msg = UserMsg | AssistantMsg;

export interface ConciergePanelProps {
  open: boolean;
  onClose: () => void;
  code: string;
  sizeCm: number | null;
  contactEmail: string | null;
  claim: ClaimMode;
  onClaim: () => void;
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
const ERROR_TEXT = "I couldn't answer that.";

let seq = 0;
const nextId = () => `m${++seq}`;

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}

/** Keeps the mobile sheet above the on-screen keyboard (visualViewport aware). */
function useSheetBox(active: boolean): React.CSSProperties | undefined {
  const [box, setBox] = useState<React.CSSProperties | undefined>(undefined);
  useEffect(() => {
    if (!active) return;
    const vv = window.visualViewport;
    const update = () => {
      const vh = window.innerHeight;
      const h = vv ? vv.height : vh;
      const bottom = vv ? Math.max(0, vh - vv.height - vv.offsetTop) : 0;
      setBox({ height: Math.min(vh * 0.92, h - 8), bottom });
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [active]);
  return box;
}

/**
 * Buyer concierge panel (spec 07): 400px right panel on desktop (passport stays scrollable beside it),
 * near-full-height sheet on mobile (focus trapped, page scroll locked). Read-only; never writes data.
 */
export function ConciergePanel({ open, onClose, code, sizeCm, contactEmail, claim, onClaim }: ConciergePanelProps) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [serverLimited, setServerLimited] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatGen = useRef(0);
  const mobile = useIsMobile();
  const sheetBox = useSheetBox(open && mobile);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const all = useMemo(() => startSuggestions(sizeCm), [sizeCm]);
  const answered = msgs.filter((m) => m.role === "user" && m.status === "ok").length;
  const limited = serverLimited || answered >= MAX_USER_TURNS;
  const asked = msgs.filter((m): m is UserMsg => m.role === "user").map((m) => m.text);
  const hasUser = asked.length > 0;
  const suggestions = busy || limited ? [] : hasUser ? nextSuggestions(all, asked) : all;
  const contact = mailto(contactEmail, code);
  const showClaim = claim === "button" || claim === "login";

  // Focus, Esc, focus trap (mobile only) and scroll lock (mobile only).
  useEffect(() => {
    if (!open) return;
    const previously = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => (inputRef.current && !inputRef.current.disabled ? inputRef.current : panelRef.current)?.focus(), 30);
    const overflow = document.body.style.overflow;
    if (mobile) document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // Leave Esc to an open dialog (the claim dialog stacks above the panel).
        const others = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]'));
        if (others.some((d) => d !== panelRef.current)) return;
        onCloseRef.current();
        return;
      }
      if (!mobile || e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previously?.focus?.();
    };
  }, [open, mobile]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy, open]);

  /** Successful turns only: failed questions and error bubbles are never sent as history. */
  const history = useCallback((list: Msg[]): ChatTurn[] => {
    const out: ChatTurn[] = [];
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m.role !== "user" || m.status !== "ok") continue;
      const reply = list[i + 1];
      if (reply && reply.role === "assistant" && reply.kind !== "error") {
        out.push({ role: "user", content: m.text }, { role: "assistant", content: reply.text });
      }
    }
    return out;
  }, []);

  const run = useCallback(
    async (userId: string, question: string, base: Msg[]) => {
      const gen = chatGen.current;
      setBusy(true);
      const res = await askConcierge(code, buildRequestMessages(history(base), question));
      if (gen !== chatGen.current) return; // New chat was pressed while waiting.
      setBusy(false);
      setMsgs((cur) => {
        const marked = cur.map((m) =>
          m.id === userId && m.role === "user" ? { ...m, status: res.ok ? ("ok" as const) : ("failed" as const) } : m,
        );
        if (res.ok) {
          const kind = answerKind(res.answer);
          return [
            ...marked,
            {
              id: nextId(),
              role: "assistant",
              kind,
              text: res.answer.answer,
              pills: kind === "answer" ? pillsFor(res.answer.sources) : [],
            },
          ];
        }
        if (res.failure === "rate_limited") return marked;
        return [...marked, { id: nextId(), role: "assistant", kind: "error", text: ERROR_TEXT, pills: [] }];
      });
      if (!res.ok && res.failure === "rate_limited") setServerLimited(true);
    },
    [code, history],
  );

  function ask(text: string) {
    if (busy || limited) return;
    const q = text.trim();
    if (!q) return;
    const user: UserMsg = { id: nextId(), role: "user", text: q, status: "pending" };
    const base = msgs;
    setMsgs([...base, user]);
    void run(user.id, q, base);
  }

  function retry(errorId: string) {
    if (busy || limited) return;
    const idx = msgs.findIndex((m) => m.id === errorId);
    const user = msgs[idx - 1];
    if (idx < 1 || !user || user.role !== "user") return;
    const base = msgs.slice(0, idx - 1);
    const pending: UserMsg = { ...user, status: "pending" };
    setMsgs([...base, pending]);
    void run(pending.id, pending.text, base);
  }

  function newChat() {
    chatGen.current += 1;
    setMsgs([]);
    setBusy(false);
    setServerLimited(false);
    inputRef.current?.focus();
  }

  return (
    <>
      {open && mobile && <div className="fixed inset-0 z-[44] bg-scrim animate-enter md:hidden" aria-hidden onClick={onClose} />}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal={mobile ? true : undefined}
        aria-label={`Ask about ${code}`}
        tabIndex={-1}
        hidden={!open}
        style={mobile ? sheetBox : undefined}
        className={cn(
          "fixed z-[45] flex flex-col bg-bg shadow-card outline-none",
          "inset-x-0 bottom-0 h-[92vh] rounded-t-[18px] animate-sheet",
          "md:inset-x-auto md:top-0 md:right-0 md:bottom-0 md:h-auto md:w-[400px] md:rounded-none md:border-l md:border-line md:animate-enter",
          !open && "hidden",
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line md:hidden" aria-hidden />
        <div className="flex items-start gap-2 border-b border-line px-4 pt-3 pb-3 md:pt-4">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold">
              Ask about <span className="font-mono">{code}</span>
            </div>
            <div className="text-xs text-muted">Answers come only from this hat&apos;s record</div>
          </div>
          <button
            type="button"
            onClick={newChat}
            aria-label="New chat"
            title="New chat"
            className="grid h-11 w-10 place-items-center rounded-[10px] hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Icon name="edit_square" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-11 w-10 place-items-center rounded-[10px] hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Icon name="close" size={22} />
          </button>
        </div>

        <div ref={listRef} className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-4" aria-live="polite" aria-relevant="additions">
          <div className="flex max-w-[90%] gap-2">
            <AssistantAvatar />
            <div className="rounded-[4px_14px_14px_14px] border border-line bg-surface px-3 py-2.5">
              Hi! I can answer questions about this hat using its verified record. What would you like to know?
            </div>
          </div>
          {msgs.map((m) =>
            m.role === "user" ? (
              <div
                key={m.id}
                className="max-w-[82%] self-end rounded-[14px_14px_4px_14px] bg-accent px-3 py-2.5 break-words whitespace-pre-wrap text-on-accent animate-enter"
              >
                {m.text}
              </div>
            ) : (
              <AssistantBubble
                key={m.id}
                msg={m}
                code={code}
                contactHref={contact}
                showClaim={showClaim}
                onClaim={onClaim}
                onRetry={() => retry(m.id)}
                retryDisabled={busy || limited}
              />
            ),
          )}
          {busy && <TypingIndicator />}
          <Suggestions items={suggestions} onPick={ask} />
        </div>

        {limited && <RateLimitBanner />}
        <Composer disabled={limited} busy={busy} onSend={ask} inputRef={inputRef} />
      </aside>
    </>
  );
}
