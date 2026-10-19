import { cn } from "@/lib/cn";

export interface IconProps {
  /** Material Symbols Rounded ligature name, e.g. "auto_awesome". Must be listed in icon-names.ts. */
  name: string;
  /** Pixel size (default 20). */
  size?: number;
  filled?: boolean;
  className?: string;
  /** Set when the icon carries meaning on its own (no visible text next to it). */
  label?: string;
}

export function Icon({ name, size = 20, filled = false, className, label }: IconProps) {
  return (
    <span
      className={cn("material-symbols-rounded shrink-0 overflow-hidden", className)}
      style={{
        fontSize: size,
        width: size,
        height: size,
        fontVariationSettings: `"FILL" ${filled ? 1 : 0}, "wght" 400, "GRAD" 0, "opsz" 24`,
      }}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {name}
    </span>
  );
}
