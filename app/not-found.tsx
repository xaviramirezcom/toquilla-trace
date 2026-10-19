import Link from "next/link";
import { Logo } from "@/components/shell/Logo";
import { EmptyState } from "@/components/ui/EmptyState";
import { getProfile } from "@/lib/auth/role";

/** Handoff "404": Go to Workshop when signed in, Go home otherwise. */
export default async function NotFound() {
  const signedIn = (await getProfile()) !== null;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center border-b border-line px-4 md:px-8">
        <Logo href="/" />
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-16">
        <EmptyState
          headingAs="h1"
          icon="explore_off"
          title="Page not found"
          description="This page doesn't exist or was moved."
          action={
            <Link
              href={signedIn ? "/workshop" : "/"}
              className="inline-flex h-11 items-center rounded-[10px] bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {signedIn ? "Go to Workshop" : "Go home"}
            </Link>
          }
        />
      </main>
    </div>
  );
}
