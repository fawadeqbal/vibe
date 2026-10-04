"use client";

import { useQuery } from "@tanstack/react-query";

import { api, type Query } from "@/lib/api/client";
import type { PermissionGroup, Role, Staff } from "@/lib/api/types";

export const teamKeys = {
  all: ["team"] as const,
  staff: (q: Query) => ["team", "staff", q] as const,
  member: (id: string) => ["team", "member", id] as const,
  roles: ["team", "roles"] as const,
  permissions: ["team", "permissions"] as const,
};

export const useStaff = (q: Query) => useQuery({ queryKey: teamKeys.staff(q), queryFn: ({ signal }) => api.get<Staff[]>("admin/staff", q, signal) });
export const useStaffMember = (id: string) => useQuery({ queryKey: teamKeys.member(id), queryFn: ({ signal }) => api.get<Staff>(`admin/staff/${id}`, undefined, signal) });
export const useRoles = () => useQuery({ queryKey: teamKeys.roles, queryFn: ({ signal }) => api.get<Role[]>("admin/roles", undefined, signal) });
export const usePermissionCatalog = () => useQuery({ queryKey: teamKeys.permissions, queryFn: ({ signal }) => api.get<PermissionGroup[]>("admin/permissions", undefined, signal), staleTime: Infinity });
