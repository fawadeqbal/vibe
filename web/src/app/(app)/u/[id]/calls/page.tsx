import { CallHistoryView } from "@/features/notifications/call-history";

export const metadata = { title: "Calls" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CallHistoryView userId={id} />;
}
