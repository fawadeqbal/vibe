import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, StaffRole, StaffStatus, StaffUser } from '@prisma/client';

import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { hashPassword, passwordProblem, temporaryPassword } from '../../../common/utils/password';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { StaffTokenService } from '../auth/staff-token.service';
import { StaffContextService } from '../core/staff-context.service';
import { ALL, effectivePermissions, isPermission, OWNER_ROLE, PERMISSION_GROUPS, P } from '../core/permissions';
import type { StaffPrincipal } from '../core/staff.types';

type StaffWithRole = StaffUser & { role: StaffRole };

export const toStaffView = (s: StaffWithRole) => ({
  id: s.id,
  email: s.email,
  name: s.name,
  status: s.status,
  role: { id: s.role.id, key: s.role.key, name: s.role.name },
  twoFactorEnabled: !!s.totpEnabledAt,
  mustChangePassword: s.mustChangePassword,
  lastLoginAt: s.lastLoginAt?.toISOString() ?? null,
  createdAt: s.createdAt.toISOString(),
});

const toRoleView = (r: StaffRole & { _count?: { staff: number } }) => ({
  id: r.id,
  key: r.key,
  name: r.name,
  description: r.description,
  permissions: effectivePermissions(r.permissions),
  allPermissions: r.permissions.includes(ALL),
  system: r.system,
  staffCount: r._count?.staff ?? 0,
  updatedAt: r.updatedAt.toISOString(),
});

const slug = (name: string): string =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

/**
 * Staff accounts and roles. Guard rails: only owners can create or change
 * owners, nobody can lock themselves out, and there is always at least one
 * active owner.
 */
@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contexts: StaffContextService,
    private readonly tokens: StaffTokenService,
  ) {}

  // ── staff ───────────────────────────────────────────────────────────────

  async list(q: { q?: string; status?: StaffStatus; roleId?: string }) {
    const where: Prisma.StaffUserWhereInput = {
      status: q.status,
      roleId: q.roleId,
      ...(q.q ? { OR: [{ email: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const rows = await this.prisma.staffUser.findMany({ where, include: { role: true }, orderBy: [{ status: 'asc' }, { createdAt: 'asc' }], take: 500 });
    return rows.map(toStaffView);
  }

  async get(id: string) {
    const s = await this.prisma.staffUser.findUnique({ where: { id }, include: { role: true } });
    if (!s) throw AppError.notFound('Staff member');
    return { ...toStaffView(s), sessions: await this.tokens.list(id) };
  }

  /** Creates the account with a temporary password (shown once) that must be changed at first sign-in. */
  async invite(me: StaffPrincipal, input: { email: string; name: string; roleId: string; password?: string }) {
    const role = await this.role(input.roleId);
    this.assertCanAssign(me, role);
    const password = input.password ?? temporaryPassword();
    if (input.password) {
      const problem = passwordProblem(input.password);
      if (problem) throw new AppError(ErrorCode.VALIDATION_FAILED, problem);
    }
    try {
      const s = await this.prisma.staffUser.create({
        data: { email: input.email.trim().toLowerCase(), name: input.name.trim(), roleId: role.id, passwordHash: await hashPassword(password), mustChangePassword: true, createdById: me.id },
        include: { role: true },
      });
      return { staff: toStaffView(s), temporaryPassword: password };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw AppError.conflict('Someone on the team already uses that e-mail');
      throw e;
    }
  }

  async update(me: StaffPrincipal, id: string, input: { name?: string; roleId?: string; status?: StaffStatus }) {
    const target = await this.prisma.staffUser.findUnique({ where: { id }, include: { role: true } });
    if (!target) throw AppError.notFound('Staff member');
    if (target.role.key === OWNER_ROLE && me.roleKey !== OWNER_ROLE) throw AppError.forbidden('Only an owner can change an owner');
    if (id === me.id && (input.status === StaffStatus.DISABLED || (input.roleId && input.roleId !== target.roleId))) {
      throw AppError.forbidden("You can't disable yourself or change your own role");
    }
    let newRole: StaffRole | undefined;
    if (input.roleId && input.roleId !== target.roleId) {
      newRole = await this.role(input.roleId);
      this.assertCanAssign(me, newRole);
    }
    const losingOwner = target.role.key === OWNER_ROLE && ((newRole && newRole.key !== OWNER_ROLE) || input.status === StaffStatus.DISABLED);
    if (losingOwner) await this.assertAnotherOwner(id);

    const updated = await this.prisma.staffUser.update({ where: { id }, data: { name: input.name?.trim(), roleId: newRole?.id, status: input.status }, include: { role: true } });
    if (input.status === StaffStatus.DISABLED) await this.tokens.revokeAll(id);
    await this.contexts.invalidate(id);
    return toStaffView(updated);
  }

  async resetPassword(me: StaffPrincipal, id: string) {
    const target = await this.guardTarget(me, id);
    const password = temporaryPassword();
    await this.prisma.staffUser.update({ where: { id: target.id }, data: { passwordHash: await hashPassword(password), mustChangePassword: true } });
    await this.tokens.revokeAll(id);
    await this.contexts.invalidate(id);
    return { temporaryPassword: password };
  }

  async resetTwoFactor(me: StaffPrincipal, id: string) {
    const target = await this.guardTarget(me, id);
    await this.prisma.staffUser.update({ where: { id: target.id }, data: { totpSecret: null, totpEnabledAt: null, recoveryCodes: [] } });
    await this.tokens.revokeAll(id);
    await this.contexts.invalidate(id);
    return this.get(id);
  }

  async revokeSessions(me: StaffPrincipal, id: string) {
    await this.guardTarget(me, id, { allowSelf: true });
    await this.tokens.revokeAll(id, id === me.id ? me.sessionId : undefined);
  }

  // ── roles ───────────────────────────────────────────────────────────────

  async roles() {
    const rows = await this.prisma.staffRole.findMany({ include: { _count: { select: { staff: true } } }, orderBy: [{ system: 'desc' }, { createdAt: 'asc' }] });
    return rows.map(toRoleView);
  }

  permissionCatalog() {
    return PERMISSION_GROUPS;
  }

  async createRole(input: { name: string; description?: string; permissions: string[] }) {
    const permissions = this.validPermissions(input.permissions);
    const key = slug(input.name);
    if (!key) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Give the role a name');
    try {
      const r = await this.prisma.staffRole.create({ data: { key, name: input.name.trim(), description: input.description?.trim() ?? '', permissions } });
      return toRoleView(r);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw AppError.conflict('A role with that name already exists');
      throw e;
    }
  }

  async updateRole(id: string, input: { name?: string; description?: string; permissions?: string[] }) {
    const role = await this.role(id);
    if (role.system) throw AppError.forbidden('Built-in roles are managed in code. Create a custom role instead.');
    const r = await this.prisma.staffRole.update({
      where: { id },
      data: { name: input.name?.trim(), description: input.description?.trim(), permissions: input.permissions ? this.validPermissions(input.permissions) : undefined },
      include: { _count: { select: { staff: true } } },
    });
    await this.contexts.invalidateRole(id);
    return toRoleView(r);
  }

  async deleteRole(id: string) {
    const role = await this.prisma.staffRole.findUnique({ where: { id }, include: { _count: { select: { staff: true } } } });
    if (!role) throw AppError.notFound('Role');
    if (role.system) throw AppError.forbidden("Built-in roles can't be deleted");
    if (role._count.staff > 0) throw AppError.conflict(`Move the ${role._count.staff} people in this role first`);
    await this.prisma.staffRole.delete({ where: { id } });
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private async role(id: string): Promise<StaffRole> {
    const r = await this.prisma.staffRole.findUnique({ where: { id } });
    if (!r) throw AppError.notFound('Role');
    return r;
  }

  private validPermissions(list: string[]): string[] {
    const unknown = list.filter((p) => !isPermission(p));
    if (unknown.length) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Unknown permissions', HttpStatus.BAD_REQUEST, { unknown });
    return [...new Set(list)];
  }

  /** You can only hand out what you have yourself; owners only by owners. */
  private assertCanAssign(me: StaffPrincipal, role: StaffRole): void {
    if (me.roleKey === OWNER_ROLE) return;
    if (role.key === OWNER_ROLE) throw AppError.forbidden('Only an owner can make someone an owner');
    const extra = effectivePermissions(role.permissions).filter((p) => !me.permissions.includes(p));
    if (extra.length) throw new AppError(ErrorCode.FORBIDDEN, "You can't give a role with more access than your own", HttpStatus.FORBIDDEN, { missing: extra });
    if (!me.permissions.includes(P.StaffManage)) throw AppError.forbidden();
  }

  private async guardTarget(me: StaffPrincipal, id: string, opts: { allowSelf?: boolean } = {}): Promise<StaffWithRole> {
    const target = await this.prisma.staffUser.findUnique({ where: { id }, include: { role: true } });
    if (!target) throw AppError.notFound('Staff member');
    if (id === me.id && !opts.allowSelf) throw AppError.forbidden('Use your account page for your own security settings');
    if (target.role.key === OWNER_ROLE && me.roleKey !== OWNER_ROLE) throw AppError.forbidden('Only an owner can change an owner');
    return target;
  }

  private async assertAnotherOwner(exceptId: string): Promise<void> {
    const others = await this.prisma.staffUser.count({ where: { id: { not: exceptId }, status: StaffStatus.ACTIVE, role: { key: OWNER_ROLE } } });
    if (others === 0) throw AppError.conflict('There must always be at least one active owner');
  }
}
