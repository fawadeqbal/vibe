import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { ReferralsPage } from "@/features/growth/referrals-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Referrals" };

export default function Page() {
  return (
    <RequirePermission permission={P.AffiliatesView}>
      <ReferralsPage />
    </RequirePermission>
  );
}
