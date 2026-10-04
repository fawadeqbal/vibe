import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { UserPage } from "@/features/users/user-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "User" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequirePermission permission={P.UsersView}>
      <UserPage id={id} />
    </RequirePermission>
  );
}
