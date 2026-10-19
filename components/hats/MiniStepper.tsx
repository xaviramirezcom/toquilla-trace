import { STAGES } from "@domain/domain";
import { cn } from "@/lib/cn";
import { FINISHED_STAGE } from "@/lib/hats/format";

/** Five dots for the five stages: done filled, current ringed, upcoming hollow. */
export function MiniStepper({ stage, showLabel = true, className }: { stage: number; showLabel?: boolean; className?: string }) {
  const label = STAGES[stage] ?? "Unknown";
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="inline-flex items-center gap-1" role="img" aria-label={`Stage ${stage + 1} of 5: ${label}`}>
        {STAGES.map((name, i) => (
          <span
            key={name}
            className={cn(
              "block h-2 w-2 rounded-full",
              i < stage && "bg-ok",
              i === stage && (stage === FINISHED_STAGE ? "bg-ok" : "bg-accent ring-2 ring-accent/30"),
              i > stage && "border border-line bg-transparent",
            )}
          />
        ))}
      </span>
      {showLabel && <span className="text-[13px] text-ink">{label}</span>}
    </span>
  );
}
