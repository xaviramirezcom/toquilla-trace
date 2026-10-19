import type { Metadata } from "next";
import { ComingSoon } from "@/components/feedback/ComingSoon";

export const metadata: Metadata = { title: "Hats" };

export default function HatsPage() {
  return <ComingSoon title="Hats" icon="styler" />;
}
