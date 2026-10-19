import { ComingSoon } from "@/components/feedback/ComingSoon";

export default async function HatDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ComingSoon title={decodeURIComponent(code)} icon="styler" />;
}
