import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { MessageDetail } from "@/features/messaging/message-detail";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Message" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequirePermission permission={P.OpsMessages}>
      <MessageDetail id={id} />
    </RequirePermission>
  );
}
