import { AccountStatusView } from "@/features/notifications/account-pages";

export const metadata = { title: "Account status" };

export default async function Page({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { note } = await searchParams;
  return <AccountStatusView note={note} />;
}
