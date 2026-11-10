import { CashoutStatusView } from "@/features/notifications/money-pages";

export const metadata = { title: "Cash-out" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CashoutStatusView id={id} />;
}
