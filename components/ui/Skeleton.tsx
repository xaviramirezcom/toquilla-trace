import { cn } from "@/lib/cn";

export interface SkeletonProps {
  className?: string;
}

/** Loading placeholder. Size it with classes, e.g. <Skeleton className="h-4 w-32" />. */
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden className={cn("animate-shimmer rounded-[8px] bg-surface2", className)} />;
}
