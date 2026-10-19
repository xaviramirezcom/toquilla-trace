"use client";

import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { usePassportMaybe } from "./PassportProvider";

// Stamp: scale(1.8) rotate(-14deg) -> scale(.94) -> 1, 600ms, cubic-bezier(.2,1.3,.4,1) (handoff "Motion").
// Off under prefers-reduced-motion (motion-reduce utility plus the global reduced-motion rule).
export const STAMP_CSS = `@keyframes tt-stamp{0%{transform:scale(1.8) rotate(-14deg);opacity:0}60%{transform:scale(.94) rotate(2deg);opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}
.tt-stamp{animation:tt-stamp 600ms cubic-bezier(.2,1.3,.4,1) both}
@media (prefers-reduced-motion: reduce){.tt-stamp{animation:none}}`;

export function StampStyles() {
  // href + precedence: React hoists it to <head> once, however many seals render.
  return (
    <style href="tt-stamp" precedence="default">
      {STAMP_CSS}
    </style>
  );
}

/** 96px verified seal. Replays the stamp when the hat is claimed (stampKey changes). */
export function Seal({ className }: { className?: string }) {
  const ctx = usePassportMaybe();
  const key = ctx?.stampKey ?? 0;
  return (
    <div className={cn("text-ok", className)}>
      <StampStyles />
      <div
        key={key}
        className="tt-stamp grid h-24 w-24 place-items-center rounded-full border-2 border-current outline-1 outline-offset-4 outline-current outline-dashed [animation-delay:150ms]"
        role="img"
        aria-label="Verified seal"
      >
        <Icon name="verified" size={52} filled />
      </div>
    </div>
  );
}

/** Small stamp used in the "This hat is now registered to you." card. */
export function ClaimStamp() {
  return (
    <div className="tt-stamp grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-current text-ok" aria-hidden>
      <Icon name="approval" size={26} />
    </div>
  );
}
