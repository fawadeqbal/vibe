import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { AffiliatePage } from "@/features/growth/affiliate-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Affiliate" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequirePermission permission={P.AffiliatesView}>
      <AffiliatePage id={id} />
    </RequirePermission>
  );
}
