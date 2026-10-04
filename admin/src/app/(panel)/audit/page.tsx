import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { AuditPage } from "@/features/audit/audit-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Audit log" };

export default function Page() {
  return (
    <RequirePermission permission={P.AuditView}>
      <AuditPage />
    </RequirePermission>
  );
}
