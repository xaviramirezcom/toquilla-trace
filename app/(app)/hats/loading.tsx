import { Card, Skeleton } from "@/components/ui";

export default function HatsLoading() {
  return (
    <section aria-busy="true" aria-label="Loading hats">
      <Skeleton className="h-8 w-28" />
      <Skeleton className="mt-2 h-4 w-16" />
      <Skeleton className="mt-5 h-11 w-full max-w-md" />
      <Card padding="none" className="mt-5 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-t border-line px-4 py-4 first:border-t-0">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="hidden h-4 w-32 md:block" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="ml-auto h-4 w-14" />
          </div>
        ))}
      </Card>
    </section>
  );
}
