import type { Metadata } from "next";
import { ComingSoon } from "@/components/feedback/ComingSoon";

export const metadata: Metadata = { title: "Agent runs" };

export default function RunsPage() {
  return <ComingSoon title="Agent runs" icon="account_tree" />;
}
