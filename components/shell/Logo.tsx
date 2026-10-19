import Link from "next/link";
import { cn } from "@/lib/cn";

export interface LogoProps {
  href?: string;
  /** Hide the wordmark (collapsed sidebar). */
  markOnly?: boolean;
  className?: string;
}

export function Logo({ href = "/workshop", markOnly = false, className }: LogoProps) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2.5 rounded-[10px]", className)}
      aria-label="Toquilla Trace"
    >
      <span className="woven-logo h-7 w-7 rounded-[7px]" aria-hidden />
      {!markOnly && (
        <span className="font-serif text-[20px] font-semibold tracking-tight text-ink">Toquilla Trace</span>
      )}
    </Link>
  );
}
