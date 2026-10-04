import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { effectivePermissions } from './permissions';
import type { StaffContext } from './staff.types';

const KEY = (id: string) => `staff:ctx:${id}`;
const REVOKED = (sid: string) => `staff:revoked:${sid}`;
const TTL_SECONDS = 60;

/**
 * Who a staff member is and what they may do, cached in Redis for a minute
 * so permission checks don't hit Postgres on every request. Any change to
 * a person or a role calls `invalidate*`, so edits apply immediately.
 */
@Injectable()
export class StaffContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async get(staffId: string): Promise<StaffContext | null> {
    const cached = await this.redis.getJson<StaffContext>(KEY(staffId));
    if (cached) return cached;
    const s = await this.prisma.staffUser.findUnique({ where: { id: staffId }, include: { role: true } });
    if (!s) return null;
    const ctx: StaffContext = {
      id: s.id,
      email: s.email,
      name: s.name,
      status: s.status,
      roleId: s.roleId,
      roleKey: s.role.key,
      roleName: s.role.name,
      permissions: effectivePermissions(s.role.permissions),
      twoFactorEnabled: !!s.totpEnabledAt,
      mustChangePassword: s.mustChangePassword,
    };
    await this.redis.setJson(KEY(staffId), ctx, TTL_SECONDS);
    return ctx;
  }

  async invalidate(...staffIds: string[]): Promise<void> {
    if (staffIds.length) await this.redis.client.del(...staffIds.map(KEY));
  }

  async invalidateRole(roleId: string): Promise<void> {
    const staff = await this.prisma.staffUser.findMany({ where: { roleId }, select: { id: true } });
    await this.invalidate(...staff.map((s) => s.id));
  }

  /** Access tokens of a revoked session stop working at once, not at expiry. */
  async markSessionsRevoked(sessionIds: string[], accessTtlSeconds: number): Promise<void> {
    if (!sessionIds.length) return;
    const m = this.redis.client.multi();
    for (const sid of sessionIds) m.set(REVOKED(sid), '1', 'EX', accessTtlSeconds);
    await m.exec();
  }

  async isSessionRevoked(sessionId: string): Promise<boolean> {
    return (await this.redis.client.exists(REVOKED(sessionId))) === 1;
  }
}
