// Date formatting for public pages. Dates show in Ecuador time (the workshops are there),
// and a date-only value ("2026-05-12") is shown as that calendar day in any time zone.

const TZ = "America/Guayaquil";
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function toDate(value: string): { date: Date; tz: string } | null {
  const m = DATE_ONLY.exec(value);
  if (m) return { date: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)), tz: "UTC" };
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : { date: d, tz: TZ };
}

/** "Oct 10, 2026" */
export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const p = toDate(value);
  if (!p) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: p.tz }).format(
    p.date,
  );
}

/** "May 12" */
export function formatShortDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const p = toDate(value);
  if (!p) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: p.tz }).format(p.date);
}

/** Whole calendar days between two timestamps (Ecuador days), never negative. */
export function daysBetween(from: string, to: string): number {
  const a = toDate(from);
  const b = toDate(to);
  if (!a || !b) return 0;
  const day = (d: Date, tz: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
      .format(d)
      .split("-")
      .map(Number);
    return Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86_400_000;
  };
  return Math.max(0, Math.round(day(b.date, b.tz) - day(a.date, a.tz)));
}

/** < 14 days "{n} days", < 60 days "{n} weeks", else "{round(days/30)} months" (spec 06). */
export function humanDuration(days: number): string {
  if (days < 14) return `${days} ${days === 1 ? "day" : "days"}`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  const months = Math.round(days / 30);
  return `${months} ${months === 1 ? "month" : "months"}`;
}
