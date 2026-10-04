import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { AppError } from '../../common/errors/app-error';
import { orderedPair } from '../../common/utils/text';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { PROFILE_INCLUDE, toPublicProfile } from '../users/user.mapper';

export const USER_BLOCKED = 'social.user-blocked';
export interface UserBlockedEvent {
  blockerId: string;
  blockedId: string;
}

const CACHE = (id: string) => `blocks:${id}`;

/**
 * Blocks are two-way for matching and messaging: if either person blocked
 * the other, they never meet again. The "everyone I can't meet" set is
 * cached in Redis because the matcher asks for it on every pairing.
 */
@Injectable()
export class BlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly events: EventEmitter2,
  ) {}

  async block(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) throw AppError.forbidden("You can't block yourself");
    const [low, high] = orderedPair(blockerId, blockedId);
    await this.prisma.$transaction([
      this.prisma.block.upsert({ where: { blockerId_blockedId: { blockerId, blockedId } }, create: { blockerId, blockedId }, update: {} }),
      this.prisma.friendship.deleteMany({ where: { userLowId: low, userHighId: high } }),
    ]);
    await this.redis.client.del(CACHE(blockerId), CACHE(blockedId));
    this.events.emit(USER_BLOCKED, { blockerId, blockedId } satisfies UserBlockedEvent);
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.prisma.block.deleteMany({ where: { blockerId, blockedId } });
    await this.redis.client.del(CACHE(blockerId), CACHE(blockedId));
  }

  async unblockAll(blockerId: string): Promise<number> {
    const rows = await this.prisma.block.findMany({ where: { blockerId }, select: { blockedId: true } });
    await this.prisma.block.deleteMany({ where: { blockerId } });
    await this.redis.client.del(CACHE(blockerId), ...rows.map((r) => CACHE(r.blockedId)));
    return rows.length;
  }

  async list(blockerId: string) {
    const rows = await this.prisma.block.findMany({ where: { blockerId }, include: { blocked: { include: PROFILE_INCLUDE } }, orderBy: { createdAt: 'desc' } });
    return rows.map((r) => ({ ...toPublicProfile(r.blocked), blockedAt: r.createdAt.toISOString() }));
  }

  async eitherBlocked(a: string, b: string): Promise<boolean> {
    return (await this.excluded(a)).has(b);
  }

  /** Everyone `userId` blocked or was blocked by. */
  async excluded(userId: string): Promise<Set<string>> {
    const cached = await this.redis.client.smembers(CACHE(userId));
    if (cached.length) return new Set(cached.filter((x) => x !== '_'));
    const rows = await this.prisma.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] }, select: { blockerId: true, blockedId: true } });
    const ids = rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId));
    await this.redis.client.multi().sadd(CACHE(userId), '_', ...ids).expire(CACHE(userId), 3600).exec();
    return new Set(ids);
  }
}
