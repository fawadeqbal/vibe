import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { SubscriptionsPage } from "@/features/finance/ledger-pages";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "VIP" };

export default function Page() {
  return (
    <RequirePermission permission={P.FinanceView}>
      <SubscriptionsPage />
    </RequirePermission>
  );
}
