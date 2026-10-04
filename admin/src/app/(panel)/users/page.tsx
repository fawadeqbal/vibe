import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { UsersPage } from "@/features/users/users-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Users" };

export default function Page() {
  return (
    <RequirePermission permission={P.UsersView}>
      <UsersPage />
    </RequirePermission>
  );
}
