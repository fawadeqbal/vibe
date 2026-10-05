import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { PayoutBatchesPage } from "@/features/finance/payout-batches-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Payout batches" };

export default function Page() {
  return (
    <RequirePermission permission={P.FinanceView}>
      <PayoutBatchesPage />
    </RequirePermission>
  );
}
