import { notFound } from "next/navigation";

import { SettingsMenuPage } from "@/features/profile/me-settings";
import { isSettingsGroup, SETTINGS_GROUPS } from "@/features/profile/settings-groups";

export async function generateMetadata({ params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  return { title: isSettingsGroup(group) ? SETTINGS_GROUPS[group] : "Settings" };
}

/** One group of Settings and activity (Me → ☰ → Account, Privacy & safety…). */
export default async function Page({ params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  if (!isSettingsGroup(group)) notFound();
  return <SettingsMenuPage group={group} />;
}
