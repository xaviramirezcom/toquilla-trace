import { cn } from "@/lib/cn";

export interface SpinnerProps {
  size?: number;
  className?: string;
  /** Screen reader text. Omit when a visible label is next to it. */
  label?: string;
}

export function Spinner({ size = 16, className, label }: SpinnerProps) {
  return (
    <svg
      className={cn("animate-spin shrink-0", className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
