// Server-rendered sections of the Verified passport (handoff "Public passport", items 1 to 6).
// Every record text renders as a React text node: no dangerouslySetInnerHTML, no markdown.
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { gradeTip } from "@/lib/passport/meta";
import { ownershipChain } from "@/lib/passport/ownership";
import { certificateStatus } from "@/lib/passport/story";
import type { OwnershipView, Passport, StoryStep } from "@/lib/passport/types";
import { GradeTip } from "./GradeTip";
import { HeroActions } from "./HeroActions";
import { Seal } from "./Seal";

export function ArchivedBanner() {
  return (
    <div role="status" className="flex items-center gap-2.5 rounded-[12px] bg-surface2 px-4 py-3 text-sm text-muted">
      <Icon name="inventory_2" />
      This hat was archived by its workshop. Its record is still valid.
    </div>
  );
}

export function Certificate({ p }: { p: Passport }) {
  const recordedBy = [p.workshop?.name, p.workshop?.city].filter(Boolean).join(", ");
  return (
    <div className="woven rounded-[22px] p-2.5">
      <section
        aria-label="Certificate"
        className="flex flex-wrap items-center gap-6 rounded-[14px] border border-straw bg-cream p-5 md:px-8 md:py-7"
      >
        <Seal />
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-xs font-bold tracking-[0.14em] text-ok uppercase">Verified authentic</span>
          <span className="font-serif text-[22px] font-medium">Recorded by {recordedBy || "a registered workshop"}</span>
          <span className="text-muted">{certificateStatus(p)}</span>
        </div>
        <div className="flex flex-col items-start gap-0.5">
          <span className="text-xs text-muted">Hat code</span>
          <span className="font-mono text-[26px] font-medium tracking-[0.04em]">{p.code}</span>
        </div>
      </section>
    </div>
  );
}

export function FlagsNote({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <p className="-mt-2 flex items-center gap-2 text-[13px] font-medium text-warn">
      <Icon name="help" size={18} />
      The workshop is reviewing part of this record.
    </p>
  );
}

function wovenBy(p: Passport) {
  const where = [p.weaver?.village, p.weaver?.province].filter(Boolean).join(", ");
  if (p.weaver?.name) {
    return (
      <>
        Hand-woven by <strong>{p.weaver.name}</strong>
        {where && ` in ${where}`}
      </>
    );
  }
  return where ? `Hand-woven by a weaver from ${where}` : "Hand-woven in Ecuador";
}

export function Hero({ p }: { p: Passport }) {
  return (
    <section className="flex flex-wrap items-stretch gap-7">
      <div
        className="grid aspect-[4/3] min-w-0 flex-[1_1_380px] place-items-center rounded-[18px] border border-line bg-[repeating-linear-gradient(135deg,var(--straw)_0_10px,var(--cream)_10px_20px)]"
        role="img"
        aria-label="Hat photo placeholder"
      >
        <div className="flex flex-col items-center gap-1.5 rounded-[10px] bg-cream px-4 py-3">
          <Icon name="photo_camera" size={36} className="text-muted" />
          <span className="font-mono text-xs text-muted">hat photo · 4:3</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-[1_1_340px] flex-col justify-center gap-4">
        <span className="text-xs font-bold tracking-[0.14em] text-muted uppercase">Grade</span>
        <h1 className="-mt-2.5 font-serif text-[56px] leading-none font-medium tracking-[-0.02em] md:text-[84px]">
          {p.grade}
        </h1>
        <p className="text-[18px] leading-normal">{wovenBy(p)}</p>
        <HeroActions />
      </div>
    </section>
  );
}

function Tile({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="relative bg-surface p-4">
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold">{value}</div>
      {children}
    </div>
  );
}

function priceText(v: Passport["price_usd"]): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : null;
}

export function SpecsStrip({ p }: { p: Passport }) {
  const tip = gradeTip(p.grade);
  const price = priceText(p.price_usd);
  return (
    <section
      aria-label="Specs"
      className="grid grid-cols-2 gap-px overflow-visible rounded-[16px] border border-line bg-line sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] [&>*:first-child]:rounded-tl-[15px] [&>*:last-child]:rounded-br-[15px]"
    >
      <Tile label="Rows per inch" value={p.rows_per_inch != null ? String(p.rows_per_inch) : "Not recorded"} />
      <Tile label="Grade" value={p.grade}>
        {tip && <GradeTip text={tip} />}
      </Tile>
      <Tile label="Straw" value={p.straw ?? "Not recorded"} />
      <Tile label="Size" value={p.size_cm != null ? `${p.size_cm} cm` : "Not recorded"} />
      {price && <Tile label="Price" value={price} />}
    </section>
  );
}

export function StoryTimeline({ steps }: { steps: StoryStep[] }) {
  return (
    <section aria-label="Story" className="min-w-0 flex-[3_1_420px] rounded-[18px] border border-line bg-surface p-5 md:p-6">
      <h2 className="mb-[18px] font-serif text-[26px] font-medium">The story of this hat</h2>
      <ol className="flex flex-col">
        {steps.map((s, i) => (
          <li key={s.stage} className="flex gap-3.5">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-full",
                  s.state === "done" && "bg-ok text-surface",
                  s.state === "current" && "border-2 border-accent bg-accent-tint text-accent",
                  s.state === "upcoming" && "border-[1.5px] border-dashed border-line text-muted",
                )}
              >
                <Icon
                  name={s.state === "done" ? "check" : s.state === "current" ? "progress_activity" : "schedule"}
                  size={17}
                />
              </span>
              {i < steps.length - 1 && (
                <span className={cn("min-h-6 w-0.5 flex-1", s.state === "done" ? "bg-ok/40" : "bg-line")} aria-hidden />
              )}
            </div>
            <div className="flex flex-col gap-0.5 pb-[18px]">
              <span className="flex flex-wrap items-baseline gap-2">
                <strong className={cn("text-base", s.state === "upcoming" && "text-muted")}>{s.stage}</strong>
                {s.date && <span className="text-[13px] text-muted">{s.date}</span>}
                <span className="sr-only">
                  {s.state === "done" ? "(done)" : s.state === "current" ? "(in progress)" : "(not yet)"}
                </span>
              </span>
              <span className="text-muted">{s.desc}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function WeaverCard({ p }: { p: Passport }) {
  const w = p.weaver;
  if (!w) return null;
  const where = [w.village, w.province].filter(Boolean).join(", ");
  const meta = [where, w.weaving_since ? `Weaving since ${w.weaving_since}` : null].filter(Boolean).join(" · ");
  const first = w.name?.split(/\s+/)[0];
  const others = w.other_hats ?? 0;
  return (
    <section aria-label="Weaver" className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-[22px]">
      <div className="flex items-center gap-3">
        <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-straw font-serif text-xl font-semibold">
          {w.name ? initials(w.name) : <Icon name="person" size={26} />}
        </span>
        <div>
          <div className="font-serif text-[21px] font-medium">{w.name ?? (w.village ? `A weaver from ${w.village}` : "A weaver")}</div>
          {meta && <div className="text-[13px] text-muted">{meta}</div>}
        </div>
      </div>
      {w.name && w.bio && <p className="text-[15px] text-pretty">{w.bio}</p>}
      {others > 0 && (
        <p className="text-[13px] font-semibold">{first ? `Other hats by ${first}: ${others}` : `Other hats by this weaver: ${others}`}</p>
      )}
    </section>
  );
}

export function OwnershipCard({ p, view }: { p: Passport; view: OwnershipView }) {
  const chain = ownershipChain(p.ownership?.owner_type);
  return (
    <section aria-label="Ownership" className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-[22px]">
      <h2 className="text-[15px] font-semibold">Ownership</h2>
      <ol className="flex flex-wrap items-center gap-1.5" aria-label="Ownership chain">
        {chain.map((c, i) => (
          <li key={c.label} className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex h-[30px] items-center gap-1 rounded-full border-[1.5px] px-3 text-[13px] font-semibold",
                c.state === "current" && "border-accent bg-accent-tint text-accent",
                c.state === "past" && "border-line bg-surface2 text-ink",
                c.state === "future" && "border-dashed border-line text-muted",
              )}
              aria-current={c.state === "current" ? "step" : undefined}
            >
              {c.state === "current" && <Icon name="person_pin" size={15} />}
              {c.label}
            </span>
            {i < chain.length - 1 && (
              <span className="text-muted" aria-hidden>
                →
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted">{view.line}</p>
    </section>
  );
}
