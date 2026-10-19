"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Dialog, Icon, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface ShareButtonProps {
  code: string;
  /** "inline" = desktop hero button (menu opens below); "bar" = 50px icon in the mobile bottom bar (menu opens above). */
  variant?: "inline" | "bar";
}

/** The canonical passport URL, never with ?via= or other query params (spec 06 rule 19). */
function passportUrl(code: string): string {
  return `${window.location.origin}/hat/${code}`;
}

/**
 * Share: the native share sheet on touch devices, otherwise a menu with Copy link and Show QR.
 * QR images are Cut (conventions section 7), so Show QR opens a placeholder.
 */
export function ShareButton({ code, variant = "inline" }: ShareButtonProps) {
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [qr, setQr] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setMenu(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenu(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  async function onShare() {
    const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    if (touch && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `Verified Panama hat ${code}`, text: `Verified Panama hat ${code}`, url: passportUrl(code) });
        return;
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return; // user cancelled, not an error
      }
    }
    setMenu((m) => !m);
  }

  async function copyLink() {
    setMenu(false);
    try {
      await navigator.clipboard.writeText(passportUrl(code));
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy the link. Copy it from the address bar instead.");
    }
  }

  return (
    <div ref={wrapRef} className={cn("relative", variant === "bar" && "shrink-0")}>
      {variant === "inline" ? (
        <button
          type="button"
          onClick={onShare}
          aria-haspopup="menu"
          aria-expanded={menu}
          className="inline-flex h-12 items-center gap-2 rounded-[12px] border border-line bg-surface px-[18px] text-[15px] font-semibold hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Icon name="ios_share" />
          Share
        </button>
      ) : (
        <button
          type="button"
          onClick={onShare}
          aria-label="Share"
          aria-haspopup="menu"
          aria-expanded={menu}
          className="grid h-[50px] w-[50px] place-items-center rounded-[14px] border border-line bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Icon name="ios_share" size={22} />
        </button>
      )}
      {menu && (
        <div
          role="menu"
          className={cn(
            "absolute z-40 flex min-w-[180px] flex-col rounded-[12px] border border-line bg-surface p-1.5 shadow-card animate-enter",
            variant === "inline" ? "top-14 left-0" : "bottom-14 left-0",
          )}
        >
          <button
            role="menuitem"
            type="button"
            onClick={copyLink}
            className="flex h-11 items-center gap-2.5 rounded-[8px] px-2.5 text-left hover:bg-surface2 focus-visible:bg-surface2 focus-visible:outline-none"
          >
            <Icon name="link" size={19} />
            Copy link
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setMenu(false);
              setQr(true);
            }}
            className="flex h-11 items-center gap-2.5 rounded-[8px] px-2.5 text-left hover:bg-surface2 focus-visible:bg-surface2 focus-visible:outline-none"
          >
            <Icon name="qr_code_2" size={19} />
            Show QR
          </button>
        </div>
      )}
      <Dialog
        open={qr}
        onClose={() => setQr(false)}
        title={`QR code for ${code}`}
        description="QR images aren't available yet. Share the link instead."
        footer={
          <>
            <Button variant="secondary" onClick={() => setQr(false)}>
              Close
            </Button>
            <Button
              icon="link"
              onClick={() => {
                setQr(false);
                void copyLink();
              }}
            >
              Copy link
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-3 py-2">
          <div
            className="woven grid h-48 w-48 place-items-center rounded-[14px] border border-straw"
            role="img"
            aria-label="QR code placeholder"
          >
            <span className="grid h-16 w-16 place-items-center rounded-[10px] bg-cream">
              <Icon name="qr_code_2" size={40} className="text-muted" />
            </span>
          </div>
          <span className="font-mono text-[13px] text-muted">/hat/{code}</span>
        </div>
      </Dialog>
    </div>
  );
}
