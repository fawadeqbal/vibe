import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { VerificationsPage } from "@/features/users/verifications-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Verifications" };

export default function Page() {
  return (
    <RequirePermission permission={P.UsersVerify}>
      <VerificationsPage />
    </RequirePermission>
  );
}
