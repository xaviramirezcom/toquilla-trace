"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { canonicalHatCode, formatCodeInput, type Via } from "@/lib/passport/code";

export interface CodeInputProps {
  /** Logged as `via` on the resulting passport view. */
  via: Extract<Via, "verify_box" | "retry">;
  label?: string;
  /** "lg" = 52px landing box; "md" = 44px inline (Not verified). */
  size?: "lg" | "md";
  inputId?: string;
  autoFocus?: boolean;
  /** Sample code links under the box ("Try TQ-9A1M8 or TQ-ZZZZZ"). */
  samples?: string[];
}

/**
 * Hat code box shared by the landing Verify box and Not verified "Try another code" (spec 06).
 * Auto-uppercase, auto-hyphen after TQ, max 8 chars, "Codes look like TQ-7F3K2." after blur when invalid.
 */
export function CodeInput({ via, label = "Have a hat code?", size = "lg", inputId, autoFocus, samples }: CodeInputProps) {
  const router = useRouter();
  const autoId = useId();
  const id = inputId ?? autoId;
  const errId = `${id}-err`;
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const code = canonicalHatCode(value);
  const showError = value.length > 0 && !code && (touched || value.length === 8);

  function submit() {
    if (!code) {
      setTouched(true);
      return;
    }
    router.push(`/hat/${code}?via=${via}`);
  }

  const h = size === "lg" ? "h-[52px]" : "h-11";
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
    >
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => {
            setValue(formatCodeInput(e.target.value));
            setTouched(false);
          }}
          onBlur={() => setTouched(true)}
          maxLength={8}
          placeholder="TQ-XXXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          autoFocus={autoFocus}
          aria-invalid={showError || undefined}
          aria-describedby={showError ? errId : undefined}
          className={cn(
            "min-w-0 flex-1 rounded-[12px] border bg-bg px-4 font-mono tracking-[0.08em] outline-none placeholder:text-muted/70",
            "focus:border-accent focus:ring-3 focus:ring-accent-tint",
            size === "lg" ? "text-[18px]" : "text-base",
            h,
            showError ? "border-err" : "border-line",
          )}
        />
        <button
          type="submit"
          disabled={!code}
          className={cn(
            "shrink-0 rounded-[12px] bg-accent px-[22px] font-semibold text-on-accent hover:bg-accent-strong",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            "disabled:cursor-not-allowed disabled:opacity-45",
            size === "lg" ? "text-base" : "text-sm",
            h,
          )}
        >
          Verify
        </button>
      </div>
      {showError && (
        <span id={errId} className="flex items-center gap-1 text-sm text-err">
          <Icon name="error" size={17} />
          Codes look like TQ-7F3K2.
        </span>
      )}
      {samples && samples.length > 0 && (
        <span className="text-[13px] text-muted">
          Try{" "}
          {samples.map((s, i) => (
            <span key={s}>
              {i > 0 && " or "}
              <button
                type="button"
                onClick={() => setValue(s)}
                className="font-mono font-medium text-accent underline underline-offset-2"
              >
                {s}
              </button>
            </span>
          ))}
        </span>
      )}
    </form>
  );
}
