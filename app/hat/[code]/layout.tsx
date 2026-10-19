import { permanentRedirect } from "next/navigation";
import { canonicalHatCode, decodeParam } from "@/lib/passport/code";

/**
 * Canonical-code redirect lives here, outside the loading.tsx Suspense boundary, so it is a real
 * 308 response (/hat/tq-9a1m8 and /hat/TQ9A1M8 -> /hat/TQ-9A1M8) instead of a streamed client redirect.
 */
export default async function PassportLayout({
  params,
  children,
}: {
  params: Promise<{ code: string }>;
  children: React.ReactNode;
}) {
  const raw = decodeParam((await params).code);
  const code = canonicalHatCode(raw);
  if (code && code !== raw) permanentRedirect(`/hat/${code}`);
  return children;
}
