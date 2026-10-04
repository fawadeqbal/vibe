import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { Composer } from "@/features/messaging/composer";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "New message" };

export default function Page() {
  return (
    <RequirePermission permission={P.OpsMessages}>
      <Composer />
    </RequirePermission>
  );
}
