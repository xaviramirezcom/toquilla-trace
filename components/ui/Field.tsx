"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

interface FieldOwnProps {
  /** Always-visible label above the field. */
  label: string;
  /** Error message below the field (adds the error border and icon). */
  error?: string | null;
  /** Helper text below the field when there is no error. */
  hint?: ReactNode;
  /** Use a mono font (hat codes, ids). */
  mono?: boolean;
}

export type InputProps = FieldOwnProps & InputHTMLAttributes<HTMLInputElement>;
export type TextareaProps = FieldOwnProps & TextareaHTMLAttributes<HTMLTextAreaElement>;

const control = cn(
  "w-full rounded-[10px] border bg-surface px-3 text-ink placeholder:text-muted",
  "transition-[border-color,box-shadow] duration-150 outline-none",
  "focus:border-accent focus:ring-[3px] focus:ring-accent-tint",
  "disabled:bg-surface2 disabled:cursor-not-allowed",
  "read-only:border-dashed read-only:text-muted",
);

function FieldShell({
  id,
  label,
  error,
  hint,
  className,
  children,
}: FieldOwnProps & { id: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="flex items-center gap-1 text-[12px] text-err">
          <Icon name="error" size={16} />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="text-[12px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ label, error, hint, mono, id, className, ...rest }: InputProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint} className={className}>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${fieldId}-msg` : undefined}
        className={cn(control, "h-11", error ? "border-err" : "border-line", mono && "font-mono")}
        {...rest}
      />
    </FieldShell>
  );
}

export function Textarea({ label, error, hint, mono, id, className, rows = 4, ...rest }: TextareaProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint} className={className}>
      <textarea
        id={fieldId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${fieldId}-msg` : undefined}
        className={cn(control, "py-2.5 resize-y", error ? "border-err" : "border-line", mono && "font-mono")}
        {...rest}
      />
    </FieldShell>
  );
}
