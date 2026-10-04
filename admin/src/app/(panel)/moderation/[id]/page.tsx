import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { ReportPage } from "@/features/moderation/report-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Report" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequirePermission permission={P.ModerationView}>
      <ReportPage id={id} />
    </RequirePermission>
  );
}
