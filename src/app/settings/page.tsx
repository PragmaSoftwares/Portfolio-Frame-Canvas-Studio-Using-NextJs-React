import { readSettings } from "@/lib/storage/settings";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { AppHeader } from "@/components/nav/AppHeader";
import { AppFooter } from "@/components/nav/AppFooter";

// See src/app/page.tsx for why this is required — readSettings() reads
// settings.json straight off disk, which Next.js can't detect on its own.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await readSettings();
  return (
    <>
      <AppHeader />
      <SettingsForm initialSettings={settings} />
      <AppFooter />
    </>
  );
}
