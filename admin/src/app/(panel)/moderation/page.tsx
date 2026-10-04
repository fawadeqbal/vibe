import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { ModerationPage } from "@/features/moderation/moderation-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return (
    <RequirePermission permission={P.ModerationView}>
      <ModerationPage />
    </RequirePermission>
  );
}
