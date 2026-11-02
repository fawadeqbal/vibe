import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { GrowthPage } from "@/features/insights/growth-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Growth" };

export default function Page() {
  return (
    <RequirePermission permission={P.DashboardView}>
      <GrowthPage />
    </RequirePermission>
  );
}
