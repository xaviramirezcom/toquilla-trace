"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/** Tinted banner at the top of an auth card. role="alert" so screen readers announce it. */
export function AuthBanner({
  tone = "err",
  children,
  action,
}: {
  tone?: "err" | "ok" | "info";
  children: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    err: "border-err bg-err-tint text-ink",
    ok: "border-ok bg-ok-tint text-ink",
    info: "border-info bg-info-tint text-ink",
  } as const;
  const icon = { err: "error", ok: "check_circle", info: "info" }[tone];
  const iconColor = { err: "text-err", ok: "text-ok", info: "text-info" }[tone];
  return (
    <div role={tone === "err" ? "alert" : "status"} className={cn("flex gap-2.5 rounded-[12px] border p-3 text-[14px]", tones[tone])}>
      <Icon name={icon} size={20} className={cn("mt-px", iconColor)} />
      <div className="min-w-0 flex-1">
        {children}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  inputRef?: React.Ref<HTMLInputElement>;
};

/** Password input with the eye toggle ("Show password" / "Hide password"). Matches components/ui Input. */
export function PasswordField({ label, error, hint, id, inputRef, className, ...rest }: PasswordFieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const [shown, setShown] = useState(false);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={fieldId} className="text-[13px] font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={fieldId}
          ref={inputRef}
          type={shown ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${fieldId}-msg` : undefined}
          className={cn(
            "h-11 w-full rounded-[10px] border bg-surface pr-12 pl-3 text-ink placeholder:text-muted outline-none",
            "transition-[border-color,box-shadow] duration-150 focus:border-accent focus:ring-[3px] focus:ring-accent-tint",
            error ? "border-err" : "border-line",
          )}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          className="absolute top-0 right-0 grid h-11 w-11 place-items-center rounded-[10px] text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Icon name={shown ? "visibility_off" : "visibility"} size={20} />
        </button>
      </div>
      {error ? (
        <p id={`${fieldId}-msg`} className="flex items-center gap-1 text-[12px] text-err">
          <Icon name="error" size={16} />
          {error}
        </p>
      ) : hint ? (
        <div id={`${fieldId}-msg`} className="text-[12px] text-muted">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

/** Primary submit: in the card on desktop, in a 52px bottom bar on mobile (thumb reach). */
export function AuthSubmit({
  children,
  loading,
  loadingLabel,
  disabled,
}: {
  children: ReactNode;
  loading: boolean;
  loadingLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:static md:border-0 md:bg-transparent md:p-0">
      <Button type="submit" size="lg" fullWidth loading={loading} loadingLabel={loadingLabel} disabled={disabled}>
        {children}
      </Button>
    </div>
  );
}
