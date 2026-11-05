import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { MarketingVisitsPage } from "@/features/marketing/visits-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "All visits · Marketing site" };

export default function Page() {
  return (
    <RequirePermission permission={P.DashboardView}>
      <MarketingVisitsPage />
    </RequirePermission>
  );
}
