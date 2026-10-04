import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { SettingsPage } from "@/features/ops/settings-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <RequirePermission permission={P.OpsSettings}>
      <SettingsPage />
    </RequirePermission>
  );
}
