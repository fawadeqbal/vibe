import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { WebhooksPage } from "@/features/integrations/webhooks-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Webhooks" };

export default function Page() {
  return (
    <RequirePermission permission={P.OpsIntegrations}>
      <WebhooksPage />
    </RequirePermission>
  );
}
