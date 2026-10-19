import type { Metadata } from "next";
import { ComingSoon } from "@/components/feedback/ComingSoon";

export const metadata: Metadata = { title: "Workshop" };

export default function WorkshopPage() {
  return <ComingSoon title="Workshop" icon="space_dashboard" />;
}
