import type { Metadata } from "next";
import { ComingSoon } from "@/components/feedback/ComingSoon";

export const metadata: Metadata = { title: "Weavers" };

export default function WeaversPage() {
  return <ComingSoon title="Weavers" icon="groups" />;
}
