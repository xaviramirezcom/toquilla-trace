"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui";

/** "What does this mean?" tooltip. Opens on tap and hover, closes on Esc and outside tap. */
export function GradeTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={ref} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        className="inline-flex min-h-11 items-center gap-1 rounded-[6px] py-1 text-[13px] font-semibold text-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Icon name="info" size={16} />
        What does this mean?
      </button>
      {open && (
        <div
          id={id}
          role="tooltip"
          className="absolute top-full left-3 z-30 -mt-1.5 w-[260px] rounded-[10px] bg-ink px-3 py-2.5 text-[13px] text-bg shadow-card animate-enter"
        >
          {text}
        </div>
      )}
    </div>
  );
}
