import { Logo } from "@/components/shell/Logo";

/** Public passport. No app shell, works logged out. */
export default async function PassportPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-10">
      <Logo href="/" />
      <p className="font-mono text-[26px]">{decodeURIComponent(code)}</p>
      <p className="text-muted">Passport coming soon.</p>
    </main>
  );
}
