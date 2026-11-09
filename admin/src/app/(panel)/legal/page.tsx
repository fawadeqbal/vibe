import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { LegalPage } from "@/features/ops/legal-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Legal pages" };

export default function Page() {
  return (
    <RequirePermission permission={P.OpsSettings}>
      <LegalPage />
    </RequirePermission>
  );
}
