import type { StaffStatus } from '@prisma/client';

import type { Permission } from './permissions';

/** Cached per staff member; what the guard checks on every request. */
export interface StaffContext {
  id: string;
  email: string;
  name: string;
  status: StaffStatus;
  roleId: string;
  roleKey: string;
  roleName: string;
  permissions: Permission[];
  twoFactorEnabled: boolean;
  mustChangePassword: boolean;
}

/** The signed-in staff member on `req.staff`. */
export interface StaffPrincipal extends StaffContext {
  sessionId: string;
}

export interface StaffTokenPayload {
  sub: string;
  sid: string;
  typ: 'staff';
}
