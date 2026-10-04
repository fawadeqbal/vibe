import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { StaffMemberPage } from "@/features/team/staff-member-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Staff member" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequirePermission permission={P.StaffView}>
      <StaffMemberPage id={id} />
    </RequirePermission>
  );
}
