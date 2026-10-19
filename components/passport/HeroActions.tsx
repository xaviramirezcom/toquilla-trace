"use client";

import { Icon } from "@/components/ui";
import { ClaimStamp } from "./Seal";
import { usePassport } from "./PassportProvider";
import { ShareButton } from "./ShareButton";

const btn =
  "inline-flex h-12 items-center gap-2 rounded-[12px] px-[18px] text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Success card after a claim in this tab, plus the desktop inline buttons (Claim, Share, Ask). */
export function HeroActions() {
  const { code, claim, justClaimed, openClaim, openConcierge } = usePassport();
  return (
    <>
      {justClaimed && (
        <div role="status" className="flex items-center gap-3 rounded-[14px] border-[1.5px] border-ok bg-ok-tint px-4 py-3.5">
          <ClaimStamp />
          <div>
            <div className="font-bold">This hat is now registered to you.</div>
            <div className="text-[13px] text-muted">Its passport now shows a verified buyer as owner.</div>
          </div>
        </div>
      )}
      <div className="hidden flex-wrap items-center gap-2.5 md:flex">
        {(claim === "button" || claim === "login") && (
          <button type="button" onClick={openClaim} className={`${btn} bg-accent px-[22px] text-on-accent hover:bg-accent-strong`}>
            <Icon name="approval" />
            Claim this hat
          </button>
        )}
        {claim === "owned" && !justClaimed && (
          <span className="inline-flex h-12 items-center gap-2 rounded-[12px] bg-ok-tint px-4 font-bold text-ok">
            <Icon name="verified" filled />
            Registered to you
          </span>
        )}
        <ShareButton code={code} />
        <button type="button" onClick={openConcierge} className={`${btn} border border-line bg-surface hover:bg-surface2`}>
          <Icon name="forum" />
          Ask about this hat
        </button>
      </div>
    </>
  );
}

/** Mobile bottom bar (< 768px): Claim + Share + Ask, Share + full-width Ask, or "Registered to you". */
export function PassportBottomBar() {
  const { code, claim, openClaim, openConcierge, conciergeOpen } = usePassport();
  if (conciergeOpen) return null;
  const canClaim = claim === "button" || claim === "login";
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t border-line bg-surface px-3 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgb(40_30_10/0.07)] md:hidden">
      {canClaim && (
        <button
          type="button"
          onClick={openClaim}
          className="flex h-[50px] flex-1 items-center justify-center gap-2 rounded-[14px] bg-accent text-base font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Icon name="approval" size={21} />
          Claim this hat
        </button>
      )}
      {claim === "owned" && (
        <span className="flex h-[50px] flex-1 items-center gap-2 rounded-[14px] bg-ok-tint px-3.5 font-bold text-ok">
          <Icon name="verified" size={21} filled />
          Registered to you
        </span>
      )}
      <ShareButton code={code} variant="bar" />
      <button
        type="button"
        onClick={openConcierge}
        className={`flex h-[50px] items-center justify-center gap-1.5 rounded-[14px] border border-line bg-surface px-3.5 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          canClaim || claim === "owned" ? "shrink-0" : "flex-1"
        }`}
      >
        <Icon name="chat" size={21} />
        Ask
      </button>
    </div>
  );
}
