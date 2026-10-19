import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Inner padding: none, sm (12px), md (16px, default) or lg (20px). */
  padding?: "none" | "sm" | "md" | "lg";
  /** Adds the token shadow (dialogs, popovers). Cards are flat by default. */
  elevated?: boolean;
}

const paddings = { none: "", sm: "p-3", md: "p-4", lg: "p-5" } as const;

export function Card({ padding = "md", elevated = false, className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "bg-surface border border-line rounded-[16px]",
        paddings[padding],
        elevated && "shadow-card",
        className,
      )}
      {...rest}
    />
  );
}
