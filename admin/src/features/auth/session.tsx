"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { api, authApi } from "@/lib/api/client";
import type { Me } from "@/lib/api/types";
import type { Permission } from "@/lib/permissions";

export const meKey = ["auth", "me"] as const;

/** The signed-in staff member (cached; refreshed in the background). */
export function useMe() {
  return useQuery({ queryKey: meKey, queryFn: ({ signal }) => api.get<Me>("admin/auth/me", undefined, signal), staleTime: 60_000 });
}

/** `const can = useCan(); can(P.UsersBan)` — for hiding UI only; the API decides. */
export function useCan() {
  const { data } = useMe();
  return React.useCallback((...perms: Permission[]) => !!data && perms.every((p) => data.permissions.includes(p)), [data]);
}

/** Renders children only with every listed permission (or `fallback`). */
export function Can({ permission, children, fallback = null }: { permission: Permission | Permission[]; children: React.ReactNode; fallback?: React.ReactNode }) {
  const can = useCan();
  const list = Array.isArray(permission) ? permission : [permission];
  return <>{can(...list) ? children : fallback}</>;
}

export function useSignOut() {
  const qc = useQueryClient();
  return React.useCallback(async () => {
    await authApi.logout().catch(() => undefined);
    qc.clear();
    // Full reload on purpose: drops every in-memory cache from the old session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }, [qc]);
}
