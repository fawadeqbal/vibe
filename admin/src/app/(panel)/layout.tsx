import { Suspense } from "react";

import { PageSkeleton, PanelGate } from "@/features/auth/gate";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <PanelGate>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </PanelGate>
  );
}
