import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RequirePermission } from "@/features/auth/gate";
import { MarketingListPage } from "@/features/marketing/list-page";
import { type ListKind, LISTS } from "@/features/marketing/lists";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Marketing site" };

export default async function Page({ params }: { params: Promise<{ list: string }> }) {
  const { list } = await params;
  if (!(list in LISTS)) notFound();
  return (
    <RequirePermission permission={P.DashboardView}>
      <MarketingListPage kind={list as ListKind} />
    </RequirePermission>
  );
}
