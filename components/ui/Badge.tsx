import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

export type BadgeTone = "neutral" | "accent" | "ok" | "warn" | "err" | "info";

export interface BadgeProps {
  tone?: BadgeTone;
  /** Material Symbols name. Every state should carry an icon or text, never colour alone. */
  icon?: string;
  /** Pill shape (radius 999) instead of the small 7px badge. */
  pill?: boolean;
  className?: string;
  children: ReactNode;
}

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface2 text-muted",
  accent: "bg-accent-tint text-accent",
  ok: "bg-ok-tint text-ok",
  warn: "bg-warn-tint text-warn",
  err: "bg-err-tint text-err",
  info: "bg-info-tint text-info",
};

export function Badge({ tone = "neutral", icon, pill = false, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 h-6 text-xs font-semibold whitespace-nowrap",
        pill ? "rounded-full" : "rounded-[7px]",
        tones[tone],
        className,
      )}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}
