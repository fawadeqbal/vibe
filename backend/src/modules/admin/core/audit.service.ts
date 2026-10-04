import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';

import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { StaffPrincipal } from './staff.types';

const REDACT = new Set(['password', 'currentPassword', 'newPassword', 'code', 'token', 'refreshToken', 'secret', 'recoveryCode', 'challenge']);

export interface AuditEntry {
  actor: Pick<StaffPrincipal, 'id' | 'email'> | { id: null; email: string };
  action: string;
  targetType?: string;
  targetId?: string;
  summary?: string;
  data?: unknown;
  req?: Request;
}

/** Removes secrets and caps size so the audit table never stores credentials or blobs. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined || depth > 4) return value ?? null;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, REDACT.has(k) ? '[redacted]' : redact(v, depth + 1)]));
  }
  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

/**
 * Append-only log of staff actions. Writes never block or fail the action
 * they describe; a failed write is logged loudly instead.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(e: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: e.actor.id,
          actorEmail: e.actor.email,
          action: e.action,
          targetType: e.targetType,
          targetId: e.targetId,
          summary: e.summary?.slice(0, 300),
          data: e.data === undefined ? undefined : (redact(e.data) as Prisma.InputJsonValue),
          ip: e.req?.ip,
          userAgent: e.req?.headers['user-agent']?.slice(0, 200),
          requestId: e.req ? String((e.req as Request & { id?: unknown }).id ?? '') || undefined : undefined,
        },
      });
    } catch (err) {
      this.logger.error({ err, action: e.action, actor: e.actor.email }, 'Audit write failed');
    }
  }
}
