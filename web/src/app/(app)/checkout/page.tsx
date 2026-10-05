import { CheckoutScreen } from "@/features/store/checkout-screen";

export const metadata = { title: "Checkout" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  return <CheckoutScreen params={{ pack: one(q.pack), plan: one(q.plan), purchase: one(q.purchase), status: one(q.status) }} />;
}
