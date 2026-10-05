import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { PayoutBatchPage } from "@/features/finance/payout-batch-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Payout batch" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequirePermission permission={P.FinanceView}>
      <PayoutBatchPage id={id} />
    </RequirePermission>
  );
}
