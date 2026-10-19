import type { Metadata } from "next";
import { Card, Icon, Input } from "@/components/ui";
import { getProfile } from "@/lib/auth/role";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

// Settings are Cut (conventions section 7): read-only fields. The theme switch lives in the user menu.
export default async function SettingsPage() {
  const profile = await getProfile();
  return (
    <section className="max-w-[760px]">
      <h1 className="text-[28px] font-semibold tracking-[-0.015em] text-ink">Settings</h1>
      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
        <Icon name="info" size={16} /> Editing is coming soon.
      </p>
      <Card padding="lg" className="mt-6">
        <h2 className="text-[16px] font-semibold text-ink">Profile</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input label="Name" value={profile?.name ?? ""} readOnly />
          <Input label="Email" value={profile?.email ?? ""} readOnly hint="Contact support to change" />
        </div>
      </Card>
      <Card padding="lg" className="mt-4">
        <h2 className="text-[16px] font-semibold text-ink">Workshop</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input label="Workshop name" value={profile?.workshopName ?? "Not set"} readOnly />
          <Input label="City" value={profile?.workshopCity ?? "Not set"} readOnly />
        </div>
      </Card>
      <Card padding="lg" className="mt-4">
        <h2 className="text-[16px] font-semibold text-ink">Appearance</h2>
        <p className="mt-2 text-[13px] text-muted">Switch between Light, Dark and System from the user menu.</p>
      </Card>
    </section>
  );
}
