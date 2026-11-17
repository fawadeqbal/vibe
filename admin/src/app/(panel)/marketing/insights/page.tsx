import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { MarketingInsightsPage } from "@/features/marketing/insights-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Marketing insights" };

export default function Page() {
  return (
    <RequirePermission permission={P.DashboardView}>
      <MarketingInsightsPage />
    </RequirePermission>
  );
}
