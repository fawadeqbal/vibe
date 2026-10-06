import { AppShell } from "@/components/layout/app-shell";
import { EngagementHost } from "@/features/engagement/engagement-host";

/** Everything after first-run: the tabs (bottom bar / rail) and the pages they push, plus app-wide pop-ups (level-up, break reminder). */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      {children}
      <EngagementHost />
    </AppShell>
  );
}
