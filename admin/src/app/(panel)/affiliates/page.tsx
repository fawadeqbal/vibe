import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { AffiliatesPage } from "@/features/growth/affiliates-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Affiliates" };

export default function Page() {
  return (
    <RequirePermission permission={P.AffiliatesView}>
      <AffiliatesPage />
    </RequirePermission>
  );
}
