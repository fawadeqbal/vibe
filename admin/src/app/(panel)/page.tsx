import { RequirePermission } from "@/features/auth/gate";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { P } from "@/lib/permissions";

export default function Page() {
  return (
    <RequirePermission permission={P.DashboardView}>
      <DashboardPage />
    </RequirePermission>
  );
}
