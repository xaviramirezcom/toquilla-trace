"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";
import { CodeInput } from "./CodeInput";

const TIPS = [
  "Hold it up to the light: real toquilla shows a tight, even weave with a small spiral “rosette” at the crown's center.",
  "It should feel supple, not stiff or papery, and spring back after a gentle squeeze of the brim.",
  "Ask for the hat code and verify it here. Every genuine Toquilla Trace hat has one.",
];

/** Not verified state (spec 06). `code` is the sanitized, 12-char text rendered as plain text. */
export function NotVerified({ code, reportHref }: { code: string; reportHref: string }) {
  const [tryCode, setTryCode] = useState(false);
  return (
    <>
      <section className="flex flex-col gap-4 rounded-[18px] border-2 border-err bg-err-tint p-5 md:p-7">
        <div className="flex items-start gap-3.5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface text-err">
            <Icon name="gpp_bad" size={28} />
          </span>
          <div>
            <h1 className="font-serif text-[28px] leading-[1.15] font-medium md:text-[32px]">
              We can&apos;t verify this hat
            </h1>
            <p className="mt-2 max-w-[560px] text-[15px]">
              The code <span className="font-mono font-medium break-all">{code || "(empty)"}</span> isn&apos;t in our
              records. It may be mistyped, or the hat may not be genuine.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => setTryCode(true)}
            aria-expanded={tryCode}
            className="h-11 rounded-[11px] bg-accent px-[18px] font-semibold text-on-accent hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Try another code
          </button>
          <a
            href={reportHref}
            {...(reportHref.startsWith("https:") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="inline-flex h-11 items-center rounded-[11px] border border-line bg-surface px-[18px] font-semibold hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Report a problem
          </a>
        </div>
        {tryCode && (
          <div className="max-w-[420px]">
            <CodeInput via="retry" size="md" inputId="tt-code" autoFocus />
          </div>
        )}
      </section>
      <section className="px-1 pt-1">
        <h2 className="mb-2.5 font-serif text-[22px] font-medium">How to spot a real Panama hat</h2>
        <ul className="flex max-w-[640px] list-disc flex-col gap-1.5 pl-5 text-[15px]">
          {TIPS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
