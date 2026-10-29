import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { AppealsPage } from "@/features/moderation/appeals-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Appeals" };

export default function Page() {
  return (
    <RequirePermission permission={P.ModerationView}>
      <AppealsPage />
    </RequirePermission>
  );
}
