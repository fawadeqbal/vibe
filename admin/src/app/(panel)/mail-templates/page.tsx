import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { TemplatesPage } from "@/features/messaging/templates-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "E-mail templates" };

export default function Page() {
  return (
    <RequirePermission permission={P.OpsTemplates}>
      <TemplatesPage />
    </RequirePermission>
  );
}
