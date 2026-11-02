import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { ConfigurationPage } from "@/features/ops/configuration-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Configuration" };

export default function Page() {
  return (
    <RequirePermission permission={P.OpsSettings}>
      <ConfigurationPage />
    </RequirePermission>
  );
}
