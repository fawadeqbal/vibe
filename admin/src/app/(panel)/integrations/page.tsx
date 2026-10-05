import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { IntegrationsPage } from "@/features/integrations/integrations-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Integrations" };

export default function Page() {
  return (
    <RequirePermission permission={P.OpsIntegrations}>
      <IntegrationsPage />
    </RequirePermission>
  );
}
