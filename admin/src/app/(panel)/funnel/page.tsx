import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { FunnelPage } from "@/features/dashboard/funnel-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Funnel" };

export default function Page() {
  return (
    <RequirePermission permission={P.DashboardView}>
      <FunnelPage />
    </RequirePermission>
  );
}
