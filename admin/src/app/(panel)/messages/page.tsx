import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { MessagesPage } from "@/features/messaging/messages-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Messages" };

export default function Page() {
  return (
    <RequirePermission permission={P.OpsMessages}>
      <MessagesPage />
    </RequirePermission>
  );
}
