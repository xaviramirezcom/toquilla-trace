import { Skeleton } from "@/components/ui";

/** Skeleton certificate and 5 timeline rows while the passport loads. */
export default function PassportLoading() {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy="true">
      <span className="sr-only" role="status">
        Loading passport...
      </span>
      <header className="flex h-16 items-center justify-between border-b border-line px-4 md:px-8">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-11 w-20 rounded-[10px]" />
      </header>
      <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-4 pt-7 pb-16 md:px-8">
        <div className="woven rounded-[22px] p-2.5">
          <div className="flex flex-wrap items-center gap-6 rounded-[14px] border border-straw bg-cream p-5 md:px-8 md:py-7">
            <Skeleton className="h-24 w-24 rounded-full" />
            <div className="flex min-w-[220px] flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-6 w-64 max-w-full" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-8 w-40" />
          </div>
        </div>
        <div className="flex flex-wrap gap-7">
          <Skeleton className="aspect-[4/3] min-w-0 flex-[1_1_380px] rounded-[18px]" />
          <div className="flex min-w-0 flex-[1_1_340px] flex-col justify-center gap-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-16 w-64 max-w-full" />
            <Skeleton className="h-5 w-72 max-w-full" />
          </div>
        </div>
        <div className="rounded-[18px] border border-line bg-surface p-6">
          <Skeleton className="mb-5 h-7 w-56" />
          <div className="flex flex-col gap-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-3.5">
                <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3.5 w-64 max-w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
