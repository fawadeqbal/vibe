import { applyDecorators, createParamDecorator, ExecutionContext, SetMetadata, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiTags } from '@nestjs/swagger';

import { IS_STAFF } from '../../../common/decorators/staff.constants';
import type { AuditOptions } from './audit.interceptor';
import { AuditInterceptor } from './audit.interceptor';
import type { Permission } from './permissions';
import type { StaffPrincipal } from './staff.types';

export { IS_STAFF };
export const STAFF_PUBLIC = 'staffPublic';
export const STAFF_PERMISSIONS = 'staffPermissions';
export const ALLOW_INCOMPLETE_SETUP = 'allowIncompleteSetup';
export const AUDIT = 'audit';

/**
 * Marks a controller as back-office: authenticated with a staff token (not
 * an app token), outside maintenance mode, and audited. Every admin
 * controller starts with `@StaffApi('users')`.
 */
export const StaffApi = (tag: string): ClassDecorator =>
  applyDecorators(SetMetadata(IS_STAFF, true), ApiTags(`admin: ${tag}`), ApiBearerAuth('staff'), UseInterceptors(AuditInterceptor));

/** No staff token needed (sign-in endpoints). */
export const StaffPublic = (): MethodDecorator & ClassDecorator => SetMetadata(STAFF_PUBLIC, true);

/** Needs every listed permission. */
export const RequirePermissions = (...permissions: Permission[]): MethodDecorator & ClassDecorator =>
  applyDecorators(SetMetadata(STAFF_PERMISSIONS, permissions), ApiForbiddenResponse({ description: `Needs: ${permissions.join(', ')}` }));

/** Reachable before 2FA setup / a forced password change (so people can finish them). */
export const AllowIncompleteSetup = (): MethodDecorator & ClassDecorator => SetMetadata(ALLOW_INCOMPLETE_SETUP, true);

/** Writes an audit entry when the handler succeeds. */
export const Audit = (action: string, opts: Omit<AuditOptions, 'action'> = {}): MethodDecorator => SetMetadata(AUDIT, { action, ...opts } satisfies AuditOptions);

/** `@CurrentStaff() me: StaffPrincipal` */
export const CurrentStaff = createParamDecorator((field: keyof StaffPrincipal | undefined, ctx: ExecutionContext) => {
  const staff = ctx.switchToHttp().getRequest().staff as StaffPrincipal | undefined;
  return field ? staff?.[field] : staff;
});
