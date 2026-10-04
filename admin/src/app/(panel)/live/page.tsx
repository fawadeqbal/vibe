import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { LivePage } from "@/features/ops/live-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Live" };

export default function Page() {
  return (
    <RequirePermission permission={P.OpsLive}>
      <LivePage />
    </RequirePermission>
  );
}
