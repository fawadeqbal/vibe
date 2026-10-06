import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { FinancePage } from "@/features/finance/finance-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Revenue and profit" };

export default function Page() {
  return (
    <RequirePermission permission={P.FinanceView}>
      <FinancePage />
    </RequirePermission>
  );
}
