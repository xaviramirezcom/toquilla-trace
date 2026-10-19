import { EmptyState } from "@/components/ui/EmptyState";

/** Placeholder body. Feature agents replace the page that renders this. */
export function ComingSoon({ title, icon = "construction" }: { title: string; icon?: string }) {
  return (
    <section>
      <h1 className="text-[28px] font-semibold tracking-[-0.015em] text-ink">{title}</h1>
      <EmptyState icon={icon} title="Coming soon" description="This page is being built." className="mt-6" />
    </section>
  );
}
