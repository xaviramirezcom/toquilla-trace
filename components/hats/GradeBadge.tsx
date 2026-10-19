import { Badge } from "@/components/ui";

const TONE = { Standard: "neutral", Fino: "info", Superfino: "accent" } as const;

export function GradeBadge({ grade }: { grade: string }) {
  return <Badge tone={TONE[grade as keyof typeof TONE] ?? "neutral"}>{grade}</Badge>;
}
