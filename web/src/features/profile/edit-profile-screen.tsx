"use client";

import { useRouter } from "next/navigation";

import { Screen } from "@/components/layout/screen";
import { AppBar } from "@/components/ui/page-header";
import { ProfileForm } from "@/features/onboarding/profile-form";

/** "Edit profile": the setup form with an app bar. */
export function EditProfileScreen() {
  const router = useRouter();
  return (
    <Screen width="sm" header={<AppBar title="Edit profile" onBack={() => router.back()} />} bodyClassName="px-0 pb-0">
      <ProfileForm editing onSaved={() => router.back()} />
    </Screen>
  );
}
