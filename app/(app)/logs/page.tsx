import type { Metadata } from "next";
import { ComingSoon } from "@/components/feedback/ComingSoon";

export const metadata: Metadata = { title: "Logs" };

export default function LogsPage() {
  return <ComingSoon title="Logs" icon="receipt_long" />;
}
