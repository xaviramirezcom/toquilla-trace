"use client";

import Link from "next/link";
import { Icon } from "@/components/ui";

export const VERIFY_INPUT_ID = "tt-verify";

/** Scrolls to the Verify box and focuses its input (top bar "Verify a hat" and mobile bottom bar). */
export function scrollToVerify() {
  const el = document.getElementById("verify");
  if (el) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72, behavior: reduce ? "auto" : "smooth" });
  }
  setTimeout(() => document.getElementById(VERIFY_INPUT_ID)?.focus({ preventScroll: true }), 350);
}

export function VerifyHatButton() {
  return (
    <button
      type="button"
      onClick={scrollToVerify}
      className="hidden h-11 items-center rounded-[10px] px-3 font-semibold hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:inline-flex"
    >
      Verify a hat
    </button>
  );
}

/** Mobile bottom bar: Verify a hat + Get started (Go to Workshop when signed in). */
export function LandingBottomBar({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-line bg-surface px-3 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgb(40_30_10/0.07)] md:hidden">
      <button
        type="button"
        onClick={scrollToVerify}
        className="flex h-[52px] flex-1 items-center justify-center gap-1.5 rounded-[14px] border border-line bg-surface text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Icon name="qr_code_scanner" />
        Verify a hat
      </button>
      <Link
        href={signedIn ? "/workshop" : "/signup"}
        className="flex h-[52px] flex-1 items-center justify-center rounded-[14px] bg-accent text-[15px] font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {signedIn ? "Go to Workshop" : "Get started"}
      </Link>
    </div>
  );
}
