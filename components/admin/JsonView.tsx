"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { tokenizeJson, type JsonTokenKind } from "@/lib/admin/logs";

const COLORS: Record<JsonTokenKind, string> = {
  key: "text-[var(--json-key)]",
  string: "text-[var(--json-string)]",
  number: "text-[var(--json-number)]",
  bool: "text-[var(--json-bool)]",
  null: "text-[var(--json-bool)]",
  punct: "text-code-text",
};

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2) ?? "null";
  } catch {
    return String(value);
  }
}

/** Pretty JSON in a dark code block with simple colouring and a Copy button ("Copied!" for 2 s). */
export function JsonView({ value, label = "Payload", maxHeight = "max-h-80" }: { value: unknown; label?: string; maxHeight?: string }) {
  const [copied, setCopied] = useState(false);
  const text = prettyJson(value);
  return (
    <div className="overflow-hidden rounded-[10px] bg-code">
      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-code-text/70">
        <span>{label}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-code-text hover:bg-white/10"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
        >
          <Icon name={copied ? "check" : "content_copy"} size={14} />
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className={cn("overflow-auto px-3 pb-3 font-mono text-xs leading-5 whitespace-pre-wrap break-words", maxHeight)}>
        {tokenizeJson(text).map((t, i) => (
          <span key={i} className={COLORS[t.kind]}>
            {t.text}
          </span>
        ))}
      </pre>
    </div>
  );
}
