import type { Metadata } from "next";
import { headers } from "next/headers";
import { after } from "next/server";
import { NotVerified } from "@/components/passport/NotVerified";
import { PassportFooter, PassportTopBar } from "@/components/passport/PassportChrome";
import { reportHref } from "@/lib/passport/report";
import { PassportProvider } from "@/components/passport/PassportProvider";
import {
  ArchivedBanner,
  Certificate,
  FlagsNote,
  Hero,
  OwnershipCard,
  SpecsStrip,
  StoryTimeline,
  WeaverCard,
} from "@/components/passport/PassportSections";
import { PassportBottomBar } from "@/components/passport/HeroActions";
import { getProfile } from "@/lib/auth/role";
import { canonicalHatCode, decodeParam, displayCode, isBot, parseVia } from "@/lib/passport/code";
import { NOT_VERIFIED_META, passportMeta } from "@/lib/passport/meta";
import { ownershipView } from "@/lib/passport/ownership";
import { getPassport, logPassportView } from "@/lib/passport/server";
import { buildStory } from "@/lib/passport/story";

// The viewer relation (recipient, owner, ...) depends on the session cookie.
export const dynamic = "force-dynamic";

type Params = Promise<{ code: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const raw = decodeParam((await params).code);
  const code = canonicalHatCode(raw);
  const base = await origin();
  const path = `/hat/${code ?? encodeURIComponent(displayCode(raw))}`;
  let meta = NOT_VERIFIED_META;
  if (code) {
    try {
      const p = await getPassport(code);
      if (p) meta = passportMeta(p);
    } catch {
      // The page itself surfaces the error; metadata falls back to the generic copy.
    }
  }
  return {
    metadataBase: new URL(base),
    title: { absolute: meta.title },
    description: meta.description,
    alternates: { canonical: path },
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: "Toquilla Trace",
      url: path,
      title: meta.title,
      description: meta.description,
    },
    twitter: { card: "summary_large_image", title: meta.title, description: meta.description },
  };
}

export default async function PassportPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const raw = decodeParam((await params).code);
  const sp = await searchParams;
  const via = parseVia(Array.isArray(sp.via) ? sp.via[0] : sp.via);
  const code = canonicalHatCode(raw);

  // Non-canonical spellings were already 308-redirected by layout.tsx.
  const ua = (await headers()).get("user-agent");
  const [passport, profile] = await Promise.all([code ? getPassport(code) : Promise.resolve(null), getProfile()]);

  const shown = code ?? displayCode(raw);
  after(() =>
    logPassportView({
      code: shown,
      found: passport !== null,
      via,
      isBot: isBot(ua),
      reason: passport ? null : code ? "not_found" : "invalid_format",
    }),
  );

  const userName = profile ? profile.name || profile.email || "You" : null;

  if (!passport) {
    return (
      <div className="flex min-h-dvh flex-col">
        <PassportTopBar code={code} userName={userName} />
        <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col gap-6 px-4 pt-7 pb-16 md:px-8">
          <NotVerified code={shown} reportHref={reportHref(shown, null)} />
        </main>
        <PassportFooter reportHref={reportHref(shown, null)} />
      </div>
    );
  }

  const story = buildStory(passport);
  const own = ownershipView(passport);
  const report = reportHref(passport.code, passport.workshop?.contact_email);

  return (
    <PassportProvider
      info={{
        code: passport.code,
        claim: own.claim,
        sizeCm: passport.size_cm,
        contactEmail: passport.workshop?.contact_email ?? null,
        user: profile ? { userId: profile.userId, workshopId: profile.workshopId } : null,
      }}
    >
      <div className="flex min-h-dvh flex-col">
        <PassportTopBar code={passport.code} userName={userName} />
        <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col gap-6 px-4 pt-7 pb-10 md:px-8 md:pb-24">
          {passport.archived && <ArchivedBanner />}
          <Certificate p={passport} />
          <FlagsNote count={passport.open_flags ?? 0} />
          <Hero p={passport} />
          <SpecsStrip p={passport} />
          <div className="flex flex-wrap items-start gap-6">
            <StoryTimeline steps={story} />
            <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-5">
              <WeaverCard p={passport} />
              <OwnershipCard p={passport} view={own} />
            </div>
          </div>
        </main>
        <PassportFooter reportHref={report} padBottom />
        <PassportBottomBar />
      </div>
    </PassportProvider>
  );
}
