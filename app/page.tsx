import type { Metadata } from "next";
import Link from "next/link";
import { GITHUB_REPO } from "@/lib/docs/registry";
import { LandingBottomBar, VERIFY_INPUT_ID, VerifyHatButton } from "@/components/landing/LandingClient";
import { CodeInput } from "@/components/passport/CodeInput";
import { Logo } from "@/components/shell/Logo";
import { Icon } from "@/components/ui";
import { getProfile } from "@/lib/auth/role";

// Reads the session cookie to swap Log in for Go to Workshop.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Toquilla Trace · Every real Panama hat has a passport" },
  description:
    "No forms, no typing. Just tell it what happened in the workshop, and the AI does the paperwork while you approve every change.",
};

const FEATURES = [
  {
    icon: "mic",
    title: "Just tell it: a 10-second voice note instead of a 5-minute form",
    body: "Talk in Spanish or English, the way you already send WhatsApp voice notes. The assistant turns it into proposed record changes.",
  },
  {
    icon: "how_to_reg",
    title: "You approve every change",
    body: "Nothing is saved until a person approves it. Rules block impossible changes, like skipping a production stage.",
  },
  {
    icon: "verified",
    title: "Buyers verify in one tap",
    body: "Each hat gets a public passport: who wove it, how long it took, and every stage it went through.",
  },
];

const linkBtn =
  "inline-flex items-center justify-center font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export default async function LandingPage() {
  const profile = await getProfile();
  const signedIn = profile !== null;

  return (
    <div className="flex min-h-dvh flex-col text-[15px] leading-normal">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line bg-bg px-4 md:px-10">
        <Logo href="/" className="mr-auto" />
        <VerifyHatButton />
        <Link
          href={signedIn ? "/workshop" : "/login"}
          className={`${linkBtn} h-11 rounded-[10px] border border-line bg-surface px-4 hover:bg-surface2`}
        >
          {signedIn ? "Go to Workshop" : "Log in"}
        </Link>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-[1120px] flex-col gap-[22px] px-4 pt-10 pb-6 md:px-10 md:pt-24 md:pb-9">
          <h1 className="max-w-[880px] font-serif text-[44px] leading-[1.04] font-medium tracking-[-0.025em] text-balance md:text-[80px]">
            Every real Panama hat has a story. <em className="text-accent">Now it has a passport.</em>
          </h1>
          <p className="max-w-[620px] text-[17px] text-pretty text-muted md:text-[20px]">
            No forms, no typing. Just tell it what happened in the workshop, and the AI does the paperwork while you
            approve every change.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Link
              href={signedIn ? "/workshop" : "/signup"}
              className={`${linkBtn} h-[52px] flex-[1_1_100%] rounded-[12px] bg-accent px-6 text-base text-on-accent hover:bg-accent-strong md:flex-none`}
            >
              {signedIn ? "Go to Workshop" : "Get started"}
            </Link>
            <Link
              href="/hat/TQ-9A1M8"
              className={`${linkBtn} h-[52px] flex-[1_1_100%] gap-2 rounded-[12px] border border-line bg-surface px-[22px] text-base hover:bg-surface2 md:flex-none`}
            >
              <Icon name="verified" />
              See a sample passport
            </Link>
          </div>
        </section>

        <section
          aria-label="Before and now"
          className="mx-auto grid w-full max-w-[1120px] grid-cols-2 gap-2 px-4 pb-8 md:gap-3.5 md:px-10 md:pb-16"
        >
          <div className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface p-3.5 opacity-85 md:px-[22px] md:py-5">
            <span className="flex items-center gap-1.5 text-xs font-bold tracking-[0.08em] text-err uppercase">
              <Icon name="edit_document" size={17} />
              Before
            </span>
            <span className="text-[15px] font-medium text-pretty text-muted line-through decoration-err md:text-[20px]">
              Open app, fill 8 fields, about 5 min
            </span>
          </div>
          <div className="flex flex-col gap-2 rounded-[16px] border-[1.5px] border-accent bg-accent-tint p-3.5 md:px-[22px] md:py-5">
            <span className="flex items-center gap-1.5 text-xs font-bold tracking-[0.08em] text-accent uppercase">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-on-accent">
                <Icon name="mic" size={15} />
              </span>
              Now
            </span>
            <span className="text-[15px] font-semibold text-pretty md:text-[20px]">Hold the mic, talk, about 10 s</span>
          </div>
        </section>

        <div aria-hidden className="woven h-3.5 border-y border-straw" />

        <section
          id="verify"
          className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-8 px-4 py-9 md:px-10 md:py-[72px]"
        >
          <div className="flex-[1_1_320px]">
            <h2 className="font-serif text-[34px] leading-[1.1] font-medium">Bought a hat? Check it here.</h2>
            <p className="mt-2.5 max-w-[440px] text-muted">
              The code is printed on the tag inside the crown. Scanning the QR opens the passport directly.
            </p>
          </div>
          <div className="flex-[1_1_360px] rounded-[18px] border border-line bg-surface p-[22px]">
            <CodeInput via="verify_box" inputId={VERIFY_INPUT_ID} samples={["TQ-9A1M8", "TQ-ZZZZZ"]} />
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-[1120px] grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3.5 px-4 pb-10 md:px-10 md:pb-[88px]">
          {FEATURES.map((f) => (
            <article key={f.icon} className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-surface p-[22px]">
              <span className="grid h-11 w-11 place-items-center rounded-[12px] bg-accent-tint text-accent">
                <Icon name={f.icon} size={24} />
              </span>
              <h3 className="font-serif text-2xl leading-[1.15] font-medium">{f.title}</h3>
              <p className="text-pretty text-muted">{f.body}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="flex flex-wrap items-center gap-4 border-t border-line px-4 pt-[22px] pb-24 text-sm text-muted md:px-10 md:pb-[22px]">
        <span className="mr-auto">Made in Cuenca, Ecuador</span>
        <Link href="/docs" className="hover:text-ink hover:underline">
          Docs
        </Link>
        <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer" className="hover:text-ink hover:underline">
          GitHub
        </a>
      </footer>

      <LandingBottomBar signedIn={signedIn} />
    </div>
  );
}
