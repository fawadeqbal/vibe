import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { RolesPage } from "@/features/team/roles-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Roles" };

export default function Page() {
  return (
    <RequirePermission permission={P.StaffView}>
      <RolesPage />
    </RequirePermission>
  );
}
