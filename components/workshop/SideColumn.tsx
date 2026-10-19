"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { absoluteTime, activityActor, activityText, relativeTime, type ActivityEvent } from "@/lib/workshop/format";
import type { TodayStats } from "@/lib/workshop/overview";

function useNow(): number | null {
  // Relative times render after mount so server and client HTML match.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return now;
}

export function TodayTiles({ stats }: { stats: TodayStats | null }) {
  const tiles = [
    { label: "Hats in progress", value: stats?.inProgress, href: "/hats", warn: false },
    { label: "Finished this week", value: stats?.finishedThisWeek, href: "/hats", warn: false },
    { label: "Waiting for review", value: stats?.waitingForReview, href: "#proposals", warn: false },
    { label: "Flags to check", value: stats?.flagsToCheck, href: "/hats?flagged=1", warn: (stats?.flagsToCheck ?? 0) > 0 },
  ];
  return (
    <section aria-labelledby="today-title" className="flex flex-col gap-3">
      <h2 id="today-title" className="text-[16px] font-semibold text-ink">
        Today
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className={cn(
              "flex min-h-[88px] flex-col justify-between rounded-[14px] border p-3.5 transition-colors focus-visible:outline-2 focus-visible:outline-accent",
              t.warn ? "border-warn bg-warn-tint hover:bg-warn-tint/80" : "border-line bg-surface hover:bg-surface2",
            )}
          >
            <span className={cn("text-[13px]", t.warn ? "text-warn" : "text-muted")}>
              {t.warn && <Icon name="flag" size={14} className="mr-1 align-[-2px]" />}
              {t.label}
            </span>
            <span className="text-[26px] font-semibold text-ink">{t.value ?? "-"}</span>
          </Link>
        ))}
      </div>
      {!stats && <p className="text-[12px] text-muted">Couldn&apos;t load today&apos;s numbers.</p>}
    </section>
  );
}

export function RecentActivity({
  events,
  isAdmin,
  userId,
}: {
  events: ActivityEvent[] | null;
  isAdmin: boolean;
  userId: string;
}) {
  const now = useNow();
  return (
    <section aria-labelledby="activity-title" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 id="activity-title" className="text-[16px] font-semibold text-ink">
          Recent activity
        </h2>
        {isAdmin && (
          <Link href="/logs" className="text-[13px] font-semibold text-accent hover:underline">
            View all in Logs
          </Link>
        )}
      </div>
      {events === null ? (
        <p className="text-[13px] text-muted">Couldn&apos;t load recent activity.</p>
      ) : events.length === 0 ? (
        <p className="text-[13px] text-muted">Nothing yet. Approved changes show up here.</p>
      ) : (
        <ul className="flex flex-col rounded-[14px] border border-line bg-surface">
          {events.map((e, i) => {
            const t = activityText(e);
            return (
              <li key={e.id} className={cn(i > 0 && "border-t border-line")}>
                <Link
                  href={`/hats/${encodeURIComponent(e.hat_code)}`}
                  className="flex min-h-12 items-start gap-3 px-3.5 py-2.5 hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Icon name={t.icon} size={20} className="mt-0.5 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] text-ink">{t.text}</span>
                    <span className="block text-[12px] text-muted">
                      {activityActor(e, userId)}
                      {now !== null && (
                        <>
                          {" · "}
                          <time dateTime={e.created_at} title={absoluteTime(e.created_at)}>
                            {relativeTime(e.created_at, now)}
                          </time>
                        </>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "grid h-6 w-6 shrink-0 place-items-center rounded-full border-2",
        on ? "border-ok bg-ok text-on-accent" : "border-line text-transparent",
      )}
      aria-label={on ? "Done" : "Not done"}
      role="img"
    >
      <Icon name="check" size={16} />
    </span>
  );
}

/** First run (no hats yet): woven-frame onboarding checklist that ticks itself. */
export function FirstRunCard({
  hasWeaver,
  sentNote,
  onTryIt,
  onExample,
}: {
  hasWeaver: boolean;
  sentNote: boolean;
  onTryIt: () => void;
  onExample: () => void;
}) {
  const done = Number(hasWeaver) + Number(sentNote);
  return (
    <section aria-labelledby="firstrun-title" className="woven rounded-[18px] p-[6px]">
      <div className="rounded-[14px] bg-surface p-4">
        <h2 id="firstrun-title" className="font-serif text-[22px] font-medium text-ink">
          Let&apos;s add your first hat
        </h2>
        <p className="text-[13px] text-muted">{done} of 3 done</p>
        <ol className="mt-4 flex flex-col gap-4">
          <li className="flex items-start gap-3">
            <Check on={hasWeaver} />
            <div className="flex flex-1 flex-col gap-2">
              <span className={cn("text-[14px] font-medium", hasWeaver && "text-muted line-through")}>Add a weaver</span>
              {!hasWeaver && (
                <Link
                  href="/weavers"
                  className="inline-flex h-9 w-fit items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-surface2"
                >
                  <Icon name="person_add" size={18} />
                  Add weaver
                </Link>
              )}
            </div>
          </li>
          <li className="flex items-start gap-3">
            <Check on={sentNote} />
            <div className="flex flex-1 flex-col gap-2">
              <span className={cn("text-[14px] font-medium", sentNote && "text-muted line-through")}>
                Send your first voice note
              </span>
              {!sentNote && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" icon="mic" onClick={onTryIt}>
                    Try it now
                  </Button>
                  <button type="button" onClick={onExample} className="min-h-9 px-1 text-[13px] font-semibold text-accent hover:underline">
                    Use an example
                  </button>
                </div>
              )}
            </div>
          </li>
          <li className="flex items-start gap-3">
            <Check on={false} />
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-[14px] font-medium text-muted">Share a passport</span>
              <span className="text-[12px] text-muted">Available after your first hat exists.</span>
            </div>
          </li>
        </ol>
      </div>
    </section>
  );
}
