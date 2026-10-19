import { Card, Skeleton } from "@/components/ui";

export default function WeaversLoading() {
  return (
    <section aria-busy="true" aria-label="Loading weavers">
      <Skeleton className="h-8 w-36" />
      <Skeleton className="mt-2 h-4 w-20" />
      <div className="mt-6 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} padding="lg">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-24" />
              </div>
            </div>
            <Skeleton className="mt-4 h-3 w-20" />
          </Card>
        ))}
      </div>
    </section>
  );
}
