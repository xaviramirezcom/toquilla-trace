// Passport top bar and footer (no app shell). Server components.
import Link from "next/link";
import { Logo } from "@/components/shell/Logo";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length ? parts.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") : "?").slice(0, 2);
}

/** 64px top bar: logo to the landing page; Log in (returns here) or the signed-in user's initials. */
export function PassportTopBar({ code, userName }: { code: string | null; userName: string | null }) {
  const next = code ? `?next=${encodeURIComponent(`/hat/${code}`)}` : "";
  return (
    <header className="flex h-16 items-center justify-between border-b border-line bg-bg px-4 md:px-8">
      <Logo href="/" />
      {userName !== null ? (
        <span
          className="grid h-8 w-8 place-items-center rounded-full bg-straw text-[13px] font-semibold"
          role="img"
          aria-label={`Signed in as ${userName}`}
          title={userName}
        >
          {initials(userName)}
        </span>
      ) : (
        <Link
          href={`/login${next}`}
          className="inline-flex h-11 items-center rounded-[10px] border border-line bg-surface px-4 font-semibold hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Log in
        </Link>
      )}
    </header>
  );
}

export function PassportFooter({ reportHref, padBottom }: { reportHref: string; padBottom?: boolean }) {
  return (
    <footer
      className={`flex flex-wrap justify-between gap-3 border-t border-line px-4 py-5 text-[13px] text-muted md:px-8 ${
        padBottom ? "pb-[96px] md:pb-5" : ""
      }`}
    >
      <span className="flex items-center gap-3">
        <span>Powered by Toquilla Trace</span>
        <Link href="/docs" className="underline-offset-4 hover:text-ink hover:underline">
          Docs
        </Link>
      </span>
      <a href={reportHref} className="font-semibold text-ink underline-offset-4 hover:underline">
        Report a problem
      </a>
    </footer>
  );
}

/** mailto for Report a problem: the workshop's contact when known, otherwise a subject-only draft. */
export function reportHref(code: string | null, contactEmail: string | null | undefined): string {
  const subject = encodeURIComponent(code ? `Problem with hat passport ${code}` : "Problem with a hat passport");
  return `mailto:${contactEmail ?? ""}?subject=${subject}`;
}
