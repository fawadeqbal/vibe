import { PaymentReceipt } from "@/features/notifications/money-pages";

export const metadata = { title: "Payment" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PaymentReceipt id={id} />;
}
