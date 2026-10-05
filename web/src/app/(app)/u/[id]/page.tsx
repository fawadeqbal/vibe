import { UserProfileScreen } from "@/features/profile/user-profile";

export const metadata = { title: "Profile" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UserProfileScreen userId={id} />;
}
