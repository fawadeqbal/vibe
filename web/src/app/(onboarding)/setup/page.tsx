import { ProfileForm } from "@/features/onboarding/profile-form";

export const metadata = { title: "Set up your profile" };

export default function Page() {
  return (
    <div className="min-h-dvh bg-bg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <ProfileForm />
    </div>
  );
}
