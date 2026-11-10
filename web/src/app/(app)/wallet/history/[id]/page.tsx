import { TransactionScreen } from "@/features/wallet/transaction-screen";

export const metadata = { title: "Details" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TransactionScreen id={id} />;
}
