import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { PurchasesPage } from "@/features/finance/purchases-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Purchases" };

export default function Page() {
  return (
    <RequirePermission permission={P.FinanceView}>
      <PurchasesPage />
    </RequirePermission>
  );
}
