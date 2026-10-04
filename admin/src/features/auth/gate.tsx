"use client";

import { ShieldOff } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { EmptyState, ErrorState } from "@/components/common/page";
import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/controls";
import type { Permission } from "@/lib/permissions";

import { useCan, useMe } from "./session";

/** Signed-in area: loads who you are, sends you to /setup if security steps are pending. */
export function PanelGate({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pending = !!me.data && (me.data.mustChangePassword || me.data.twoFactorSetupRequired);

  React.useEffect(() => {
    if (pending) router.replace("/setup");
  }, [pending, router]);

  if (me.error) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </div>
    );
  }
  return <AppShell>{!me.data || pending ? <PageSkeleton /> : children}</AppShell>;
}

/** Wrap a screen: shows a friendly "no access" instead of a broken page. */
export function RequirePermission({ permission, children }: { permission: Permission | Permission[]; children: React.ReactNode }) {
  const can = useCan();
  const list = Array.isArray(permission) ? permission : [permission];
  if (!can(...list)) {
    return <EmptyState icon={ShieldOff} title="You don't have access to this page" description="Your role doesn't include it. An owner can change roles under Team → Roles." className="py-24" />;
  }
  return <>{children}</>;
}

export function PageSkeleton() {
  return (
    <div className="space-y-5" aria-busy>
      <Skeleton className="h-7 w-48" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}
