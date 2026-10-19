"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Card, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { activityIcon, activityText, daysBetween, longDate, relativeTime, shortDate, type TimelineStep } from "@/lib/hats/format";
import type { HatDetail, HatEvent } from "@/lib/hats/types";

export function SourceTag({ source }: { source: string | null }) {
  if (source === "ai_proposal") {
    return (
      <span className="inline-flex h-6 items-center gap-1 rounded-[7px] border-[1.5px] border-dashed border-accent bg-accent-tint px-2 text-xs font-semibold text-accent">
        <Icon name="auto_awesome" size={13} /> AI proposal
      </span>
    );
  }
  if (source === "manual") return <Badge icon="person">Manual</Badge>;
  return null;
}

// ---------------------------------------------------------------------------
// Production timeline
// ---------------------------------------------------------------------------

export function Timeline({ steps, nowIso, isAdmin }: { steps: TimelineStep[]; nowIso: string; isAdmin: boolean }) {
  const [openStep, setOpenStep] = useState<number | null>(null);
  return (
    <Card padding="lg">
      <h2 className="text-[16px] font-semibold text-ink">Production timeline</h2>
      <ol className="mt-4 flex flex-col gap-4 md:grid md:grid-cols-5 md:gap-3">
        {steps.map((s) => {
          const canOpen = s.state !== "upcoming" && (s.actor || s.note || s.at);
          return (
            <li key={s.name} className="relative flex gap-3 md:flex-col md:gap-2">
              <span
                className={cn(
                  "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full",
                  s.state === "done" && "bg-ok text-on-accent",
                  s.state === "current" && "border-[3px] border-accent bg-surface text-accent",
                  s.state === "upcoming" && "border border-dashed border-line text-muted",
                )}
                aria-hidden
              >
                {s.state === "done" ? <Icon name="check" size={18} /> : <span className="text-xs font-semibold">{s.index + 1}</span>}
              </span>
              <div className="min-w-0">
                <button
                  type="button"
                  disabled={!canOpen}
                  onClick={() => setOpenStep(openStep === s.index ? null : s.index)}
                  aria-expanded={canOpen ? openStep === s.index : undefined}
                  className={cn(
                    "text-left text-sm font-semibold",
                    s.state === "upcoming" ? "text-muted" : "text-ink hover:underline",
                    "disabled:cursor-default disabled:no-underline",
                  )}
                >
                  {s.name}
                  <span className="sr-only">
                    {s.state === "done" ? " (done)" : s.state === "current" ? " (current)" : " (upcoming)"}
                  </span>
                </button>
                {s.state === "done" && (
                  <div className="mt-0.5 flex flex-col gap-1 text-xs text-muted">
                    {s.at && <span>{shortDate(s.at)}</span>}
                    {s.actor && <span>Approved by {s.actor}</span>}
                    {s.source && (
                      <span>
                        <SourceTag source={s.source} />
                      </span>
                    )}
                  </div>
                )}
                {s.state === "current" && s.at && (
                  <p className="mt-0.5 text-xs text-muted">
                    In progress since {shortDate(s.at)} ({daysBetween(s.at, nowIso)} {daysBetween(s.at, nowIso) === 1 ? "day" : "days"})
                  </p>
                )}
                {openStep === s.index && (
                  <div className="mt-2 rounded-[10px] border border-line bg-surface2 p-3 text-xs text-ink md:absolute md:top-full md:left-0 md:z-10 md:w-64 md:shadow-card">
                    {s.at && <p className="font-mono">{new Date(s.at).toISOString().replace("T", " ").slice(0, 19)} UTC</p>}
                    {s.actor && <p className="mt-1">Approved by {s.actor}</p>}
                    {s.note && <p className="mt-1 text-muted">&ldquo;{s.note}&rdquo;</p>}
                    {isAdmin && (
                      <Link
                        href={s.runId ? `/runs/${s.runId}` : `/runs`}
                        className="mt-2 inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                      >
                        View trace <Icon name="arrow_forward" size={14} />
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Details card (read only)
// ---------------------------------------------------------------------------

export function DetailsCard({ hat }: { hat: HatDetail }) {
  const rows: [string, React.ReactNode][] = [
    ["Grade", hat.grade],
    ["Rows per inch", hat.rows_per_inch],
    ["Straw color", hat.straw ?? "Not set"],
    ["Size", hat.size_cm ? `${hat.size_cm} cm` : "Not set"],
    ["Price", hat.price_usd !== null && hat.price_usd !== undefined ? `$${Number(hat.price_usd).toLocaleString("en-US")}` : "Not set"],
    [
      "Weaver",
      hat.weaver ? (
        <Link href="/weavers" className="text-accent hover:underline">
          {hat.weaver.name}
          {hat.weaver.village ? `, ${hat.weaver.village}` : ""}
        </Link>
      ) : (
        "Not set"
      ),
    ],
    ["Workshop", hat.workshop_name ?? "Not set"],
    ["Created", longDate(hat.created_at)],
  ];
  return (
    <Card padding="lg">
      <h2 className="text-[16px] font-semibold text-ink">Details</h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="mt-0.5 text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Ownership chain
// ---------------------------------------------------------------------------

const CHAIN = ["workshop", "seller", "buyer"] as const;

export function OwnershipChain({ hat }: { hat: HatDetail }) {
  const current = CHAIN.indexOf(hat.owner_type);
  const transferEvent = [...hat.events].reverse().find((e) => e.type === "transferred");
  const waiting = Boolean(hat.transfer_email) && !hat.owner_user_id;
  return (
    <Card padding="lg">
      <h2 className="text-[16px] font-semibold text-ink">Ownership</h2>
      <ol className="mt-3 flex flex-wrap items-center gap-2">
        {CHAIN.map((o, i) => {
          const label = o === "workshop" ? (hat.workshop_name ?? "Workshop") : o === "seller" ? "Seller" : "Buyer";
          const state = i < current ? "past" : i === current ? "current" : "future";
          return (
            <li key={o} className="flex items-center gap-2">
              {i > 0 && <Icon name="arrow_forward" size={16} className="text-muted" />}
              <span
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-medium",
                  state === "current" && "bg-accent text-on-accent",
                  state === "past" && "bg-surface2 text-ink",
                  state === "future" && "border border-dashed border-line text-muted",
                )}
              >
                {state === "current" && <Icon name="location_on" size={16} filled />}
                {label}
                {state === "past" && i === 0 && transferEvent && <span className="text-xs text-muted">· {shortDate(transferEvent.created_at)}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {waiting && (
        <p className="mt-3 text-[13px] text-muted">
          Transferred to a {hat.owner_type === "seller" ? "seller" : "buyer"}
          {transferEvent ? ` on ${longDate(transferEvent.created_at)}` : ""}. Waiting for them to claim it.
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export function ActivityList({ events, ownerType, nowIso }: { events: HatEvent[]; ownerType: string; nowIso: string }) {
  const newest = [...events].reverse();
  if (newest.length === 0) return <p className="py-6 text-center text-[13px] text-muted">No activity yet.</p>;
  return (
    <ul className="flex flex-col">
      {newest.map((e) => (
        <li key={e.id} className="flex gap-3 border-t border-line py-3 first:border-t-0">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface2 text-muted">
            <Icon name={activityIcon(e.type)} size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink">{activityText(e, ownerType)}</p>
            {e.note && e.type !== "flag_reviewed" && <p className="mt-0.5 text-[13px] text-muted">&ldquo;{e.note}&rdquo;</p>}
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>
                {e.actor_name ?? "Someone"} · <span title={longDate(e.created_at)}>{relativeTime(e.created_at, nowIso)}</span>
              </span>
              <SourceTag source={e.source} />
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
