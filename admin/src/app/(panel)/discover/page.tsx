import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { DiscoverPage } from "@/features/dashboard/discover-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Discover and calls" };

export default function Page() {
  return (
    <RequirePermission permission={P.DashboardView}>
      <DiscoverPage />
    </RequirePermission>
  );
}
