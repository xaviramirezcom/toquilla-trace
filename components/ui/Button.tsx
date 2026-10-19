import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and `loadingLabel`, disables the button and keeps its width. */
  loading?: boolean;
  /** e.g. "Approving…". Defaults to the children. */
  loadingLabel?: ReactNode;
  /** Material Symbols name shown before the label. */
  icon?: string;
  fullWidth?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-strong",
  secondary: "bg-surface text-ink border border-line hover:bg-surface2",
  ghost: "bg-transparent text-ink hover:bg-accent-tint",
  destructive: "bg-err text-on-accent hover:opacity-90",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-[13px] gap-1.5",
  md: "h-11 px-4 text-sm gap-2",
  lg: "h-[52px] px-5 text-[15px] gap-2 rounded-[12px]",
  icon: "h-11 w-11 justify-center",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingLabel,
  icon,
  fullWidth = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        "relative inline-flex items-center justify-center rounded-[10px] font-semibold select-none",
        "transition-colors duration-150 active:translate-y-px",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:active:translate-y-0",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {/* Both layers share one grid cell, so the button keeps its width while loading. */}
      <span className="grid place-items-center">
        <span className={cn("col-start-1 row-start-1 inline-flex items-center gap-2", loading && "invisible")}>
          {icon && <Icon name={icon} size={size === "sm" ? 18 : 20} />}
          {children}
        </span>
        {loading && (
          <span className="col-start-1 row-start-1 inline-flex items-center gap-2 whitespace-nowrap">
            <Spinner size={16} />
            {size !== "icon" && (loadingLabel ?? children)}
          </span>
        )}
      </span>
    </button>
  );
}
