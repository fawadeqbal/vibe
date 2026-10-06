import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { AffiliatePayoutsPage } from "@/features/growth/affiliate-payouts-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Affiliate payouts" };

export default function Page() {
  return (
    <RequirePermission permission={P.AffiliatesView}>
      <AffiliatePayoutsPage />
    </RequirePermission>
  );
}
