import type { Metadata } from "next";
import { HatsList } from "@/components/hats/HatsList";
import { listHats } from "@/lib/hats/queries";

export const metadata: Metadata = { title: "Hats" };
export const dynamic = "force-dynamic";

export default async function HatsPage({ searchParams }: { searchParams: Promise<{ flagged?: string }> }) {
  const { flagged } = await searchParams;
  const rows = await listHats();
  return <HatsList rows={rows} nowIso={new Date().toISOString()} initialFlagged={flagged === "1"} />;
}
