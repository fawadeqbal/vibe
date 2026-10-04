import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { StaffPage } from "@/features/team/staff-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Staff" };

export default function Page() {
  return (
    <RequirePermission permission={P.StaffView}>
      <StaffPage />
    </RequirePermission>
  );
}
