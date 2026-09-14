import { readSettings } from "@/lib/storage/settings";
import { SettingsForm } from "@/components/settings/SettingsForm";

export default async function SettingsPage() {
  const settings = await readSettings();
  return <SettingsForm initialSettings={settings} />;
}
