import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { MatchingPage } from "@/features/insights/matching-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Matching" };

export default function Page() {
  return (
    <RequirePermission permission={P.DashboardView}>
      <MatchingPage />
    </RequirePermission>
  );
}
