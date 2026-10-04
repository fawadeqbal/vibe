import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { EconomyPage } from "@/features/economy/economy-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Economy" };

export default function Page() {
  return (
    <RequirePermission permission={P.DashboardView}>
      <EconomyPage />
    </RequirePermission>
  );
}
