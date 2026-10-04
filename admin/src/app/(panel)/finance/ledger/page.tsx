import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { LedgerPage } from "@/features/finance/ledger-pages";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Ledger" };

export default function Page() {
  return (
    <RequirePermission permission={P.WalletView}>
      <LedgerPage />
    </RequirePermission>
  );
}
