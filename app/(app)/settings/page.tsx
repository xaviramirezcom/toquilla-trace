import type { Metadata } from "next";
import { ComingSoon } from "@/components/feedback/ComingSoon";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <ComingSoon title="Settings" icon="settings" />;
}
