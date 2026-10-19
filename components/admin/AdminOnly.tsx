import Link from "next/link";
import { Card, Icon } from "@/components/ui";

/** Shown to members on admin pages (spec 01 section 6.3). UX only: RLS returns no rows to members anyway. */
export function AdminOnly({ page }: { page: "Agent runs" | "Logs" }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Card padding="lg" className="max-w-md text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent-tint text-accent">
          <Icon name="shield" size={28} />
        </div>
        <h1 className="mt-4 text-[20px] font-semibold text-ink">{page} is for admins</h1>
        <p className="mt-2 text-[13px] text-muted">
          This page shows technical details from every workshop, so only Toquilla Trace admins can open it. If something
          isn&apos;t working, share the reference from the error message with support.
        </p>
        <Link
          href="/workshop"
          className="mt-5 inline-flex h-11 items-center rounded-[10px] bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-strong"
        >
          Go to Workshop
        </Link>
      </Card>
    </div>
  );
}
