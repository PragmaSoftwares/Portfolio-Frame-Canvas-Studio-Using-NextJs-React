import { readSettings } from "@/lib/storage/settings";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { AppHeader } from "@/components/nav/AppHeader";
import { AppFooter } from "@/components/nav/AppFooter";

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
