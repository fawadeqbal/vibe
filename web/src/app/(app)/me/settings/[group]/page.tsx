import { notFound } from "next/navigation";

import { SettingsGroupPage } from "@/features/profile/me-settings";
import { isSettingsGroup, SETTINGS_GROUPS } from "@/features/profile/settings-groups";

export async function generateMetadata({ params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  return { title: isSettingsGroup(group) ? SETTINGS_GROUPS[group] : "Settings" };
}

/** Me → one settings group (Account, Privacy & safety…). */
export default async function Page({ params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  if (!isSettingsGroup(group)) notFound();
  return <SettingsGroupPage group={group} />;
}
