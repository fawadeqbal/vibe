import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FollowStatus, FriendshipStatus, Prisma, UserStatus } from '@prisma/client';

import { CursorQueryDto } from '../../common/dto/pagination.dto';
import { Clock, MS } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { PROFILE_INCLUDE, PublicProfile, toPublicProfile } from '../users/user.mapper';
import type { Content, NotificationType } from './catalog';

const KEEP_DAYS = 90;

/** What the Notifications page needs to show the right button next to a person. */
export interface ActivityRel {
  friend: 'none' | 'friends' | 'requested' | 'incoming';
  follow: 'none' | 'following' | 'requested';
  followsYou: boolean;
  /** They asked to follow you and it's still waiting. */
  followRequest: boolean;
}

export interface ActivityView {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  /** Who it's from, as they are now (null for Vibe's own, or if they're gone). */
  actor: PublicProfile | null;
  rel: ActivityRel | null;
  read: boolean;
  createdAt: string;
}

/**
 * The Notifications page: a history of what happened to you — friend and
 * follow requests, new followers, matches, missed calls, money and account
 * news. NotificationsService adds a line for every catalog type with `feed`,
 * even when the push was skipped because you were in the app.
 */
@Injectable()
export class ActivityFeedService {
  private readonly log = new Logger(ActivityFeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly clock: Clock,
  ) {}

  /** Called by NotificationsService. Never throws. */
  async record(userId: string, type: NotificationType, c: Content): Promise<void> {
    if (!type.feed) return;
    try {
      const actorId = type.feed === 'person' ? c.data.userId || c.data.friendId || null : null;
      if (actorId === userId) return;
      const row = await this.prisma.activityItem.create({
        data: { userId, type: type.key, actorId, title: c.title.slice(0, 200), body: (c.detail ?? c.body).slice(0, 500), data: c.data as Prisma.InputJsonObject },
      });
      const [item] = await this.views(userId, [row]);
      this.realtime.toUser(userId, ServerEvent.ActivityNew, { item, unread: await this.unread(userId) });
    } catch (e) {
      this.log.warn(`activity for ${userId} not saved: ${(e as Error).message}`);
    }
  }

  async list(userId: string, q: CursorQueryDto): Promise<{ items: ActivityView[]; nextCursor: string | null; unread: number }> {
    const rows = await this.prisma.activityItem.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { skip: 1, cursor: { id: q.cursor } } : {}),
    });
    const page = rows.slice(0, q.limit);
    return { items: await this.views(userId, page), nextCursor: rows.length > q.limit ? page[page.length - 1].id : null, unread: await this.unread(userId) };
  }

  unread(userId: string): Promise<number> {
    return this.prisma.activityItem.count({ where: { userId, readAt: null } });
  }

  /** Marks the given lines (or all) as read; every device's badge updates. */
  async markRead(userId: string, ids?: string[]): Promise<{ unread: number }> {
    await this.prisma.activityItem.updateMany({ where: { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) }, data: { readAt: this.clock.now() } });
    const unread = await this.unread(userId);
    this.realtime.toUser(userId, ServerEvent.ActivityRead, { unread });
    return { unread };
  }

  /** Lines with the person as they are now, and where you stand with them (for Accept / Follow back / Message). */
  private async views(me: string, rows: { id: string; type: string; actorId: string | null; title: string; body: string; data: Prisma.JsonValue; readAt: Date | null; createdAt: Date }[]): Promise<ActivityView[]> {
    const ids = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
    const [users, friendships, mine, theirs] = ids.length
      ? await Promise.all([
          this.prisma.user.findMany({ where: { id: { in: ids }, status: UserStatus.ACTIVE }, include: PROFILE_INCLUDE }),
          this.prisma.friendship.findMany({ where: { OR: ids.map((id) => (me < id ? { userLowId: me, userHighId: id } : { userLowId: id, userHighId: me })) } }),
          this.prisma.follow.findMany({ where: { followerId: me, followeeId: { in: ids } }, select: { followeeId: true, status: true } }),
          this.prisma.follow.findMany({ where: { followeeId: me, followerId: { in: ids } }, select: { followerId: true, status: true } }),
        ])
      : [[], [], [], []];
    const now = this.clock.now();
    const byId = new Map(users.map((u) => [u.id, toPublicProfile(u, now)]));
    const friendOf = new Map(friendships.map((f) => [f.userLowId === me ? f.userHighId : f.userLowId, f]));
    const iFollow = new Map(mine.map((f) => [f.followeeId, f.status]));
    const theyFollow = new Map(theirs.map((f) => [f.followerId, f.status]));
    return rows.map((r) => {
      const actor = r.actorId ? (byId.get(r.actorId) ?? null) : null;
      let rel: ActivityRel | null = null;
      if (actor) {
        const f = friendOf.get(actor.id);
        const mineF = iFollow.get(actor.id);
        rel = {
          friend: !f ? 'none' : f.status === FriendshipStatus.ACCEPTED ? 'friends' : f.requesterId === me ? 'requested' : 'incoming',
          follow: !mineF ? 'none' : mineF === FollowStatus.ACTIVE ? 'following' : 'requested',
          followsYou: theyFollow.get(actor.id) === FollowStatus.ACTIVE,
          followRequest: theyFollow.get(actor.id) === FollowStatus.PENDING,
        };
      }
      return { id: r.id, type: r.type, title: r.title, body: r.body, data: (r.data ?? {}) as Record<string, string>, actor, rel, read: !!r.readAt, createdAt: r.createdAt.toISOString() };
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanup(): Promise<void> {
    await this.prisma.activityItem.deleteMany({ where: { createdAt: { lt: new Date(this.clock.now().getTime() - KEEP_DAYS * MS.day) } } });
  }
}
