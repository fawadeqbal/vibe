import { RequirePermission } from "@/features/auth/gate";
import { HealthPage } from "@/features/insights/health-page";
import { P } from "@/lib/permissions";

export default function Page() {
  return (
    <RequirePermission permission={P.DashboardView}>
      <HealthPage />
    </RequirePermission>
  );
}
