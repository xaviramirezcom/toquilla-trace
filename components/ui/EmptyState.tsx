import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

export interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: ReactNode;
  /** Usually a <Button>. */
  action?: ReactNode;
  className?: string;
  /** Heading level for the title: h1 when the empty state is the whole page (404). */
  headingAs?: "h1" | "h2" | "h3";
}

export function EmptyState({
  icon = "inventory_2",
  title,
  description,
  action,
  className,
  headingAs: Heading = "h3",
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center text-center gap-3 px-6 py-10", className)}>
      <div className="woven rounded-[16px] p-[6px]" aria-hidden>
        <div className="grid h-14 w-14 place-items-center rounded-[12px] bg-surface text-accent">
          <Icon name={icon} size={28} />
        </div>
      </div>
      <Heading className="text-[16px] font-semibold text-ink">{title}</Heading>
      {description && <p className="max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
