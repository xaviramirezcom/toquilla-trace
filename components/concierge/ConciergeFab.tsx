"use client";

import { Icon } from "@/components/ui";

/** Desktop 56px FAB "Ask about this hat" (mobile uses the bottom bar Ask button). */
export function ConciergeFab({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="fixed right-5 bottom-5 z-40 hidden h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent shadow-card hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:flex"
    >
      <Icon name="chat" size={24} />
      Ask about this hat
    </button>
  );
}
