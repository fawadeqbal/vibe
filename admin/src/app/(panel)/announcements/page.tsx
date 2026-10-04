import type { Metadata } from "next";

import { RequirePermission } from "@/features/auth/gate";
import { AnnouncementsPage } from "@/features/ops/announcements-page";
import { P } from "@/lib/permissions";

export const metadata: Metadata = { title: "Announcements" };

export default function Page() {
  return (
    <RequirePermission permission={P.OpsAnnouncements}>
      <AnnouncementsPage />
    </RequirePermission>
  );
}
