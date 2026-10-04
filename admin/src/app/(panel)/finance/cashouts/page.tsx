import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { CashoutsPage } from "@/features/finance/cashouts-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Cash-outs" };

export default function Page() {
  return (
    <RequirePermission permission={P.FinanceView}>
      <CashoutsPage />
    </RequirePermission>
  );
}
