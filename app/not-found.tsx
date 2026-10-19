import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <EmptyState
        icon="explore_off"
        title="Page not found"
        description="The page you're looking for doesn't exist."
        action={
          <Link href="/" className="font-semibold text-accent underline-offset-4 hover:underline">
            Go home
          </Link>
        }
      />
    </main>
  );
}
