import { ComingSoon } from "@/components/feedback/ComingSoon";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ComingSoon title={`Run ${decodeURIComponent(id)}`} icon="account_tree" />;
}
