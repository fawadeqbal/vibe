import { FollowListsScreen } from "@/features/profile/follow-lists-screen";
import type { FollowList } from "@/lib/models";

export const metadata = { title: "Followers" };

const TABS: FollowList[] = ["followers", "following", "requests"];

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <FollowListsScreen initialTab={TABS.find((x) => x === tab) ?? "followers"} />;
}
