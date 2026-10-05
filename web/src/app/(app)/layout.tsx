import { AppShell } from "@/components/layout/app-shell";

/** Everything after first-run: the tabs (bottom bar / rail) and the pages they push. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
