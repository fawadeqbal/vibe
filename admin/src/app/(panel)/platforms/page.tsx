import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { PlatformsPage } from "@/features/dashboard/platforms-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "App vs web" };

export default function Page() {
  return (
    <RequirePermission permission={P.DashboardView}>
      <PlatformsPage />
    </RequirePermission>
  );
}
