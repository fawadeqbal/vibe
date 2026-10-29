import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { MarketingPage } from "@/features/dashboard/marketing-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Marketing site" };

export default function Page() {
  return (
    <RequirePermission permission={P.DashboardView}>
      <MarketingPage />
    </RequirePermission>
  );
}
