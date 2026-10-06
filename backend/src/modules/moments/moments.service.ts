import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { FollowStatus, FriendshipStatus, Moment, ReportReason, UserStatus } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock, MS } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { RedisService } from '../../infra/redis/redis.service';
import { StorageProvider } from '../../infra/storage/storage.provider';
import { ModerationService } from '../moderation/moderation.service';
import { BlocksService } from '../social/blocks.service';
import { PROFILE_INCLUDE, PublicProfile, toPublicProfile } from '../users/user.mapper';

/** Live moments per person. */
export const MAX_ACTIVE_MOMENTS = 10;
const LIFETIME_MS = 24 * MS.hour;
const IMAGE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export interface MomentDto {
  id: string;
  mediaUrl: string;
  caption: string;
  createdAt: string;
  expiresAt: string;
  seen: boolean;
  /** Your own moments only. */
  viewsCount?: number;
}

export interface MomentsFeed {
  mine: MomentDto[];
  people: { author: PublicProfile; moments: MomentDto[]; allSeen: boolean }[];
}

/**
 * Moments: 24-hour photos for the people who follow you (ACTIVE follows)
 * and your friends; blocks hide them both ways. Expired rows and their
 * media are removed by an hourly job.
 */
@Injectable()
export class MomentsService {
  private readonly logger = new Logger(MomentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageProvider,
    private readonly realtime: RealtimeService,
    private readonly blocks: BlocksService,
    private readonly moderation: ModerationService,
    private readonly clock: Clock,
  ) {}

  private dto(m: Moment, seen: boolean, own: boolean): MomentDto {
    return { id: m.id, mediaUrl: m.mediaUrl, caption: m.caption, createdAt: m.createdAt.toISOString(), expiresAt: m.expiresAt.toISOString(), seen, ...(own ? { viewsCount: m.viewsCount } : {}) };
  }

  private live() {
    return { deletedAt: null, expiresAt: { gt: this.clock.now() } };
  }

  async create(userId: string, file: { buffer: Buffer; mimetype: string } | undefined, caption = ''): Promise<MomentDto> {
    if (!file) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Add a photo');
    const ext = IMAGE_EXT[file.mimetype];
    if (!ext) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Use a JPEG, PNG or WebP image', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    await this.moderation.assertNotBanned(userId);
    const active = await this.prisma.moment.count({ where: { userId, ...this.live() } });
    if (active >= MAX_ACTIVE_MOMENTS) throw new AppError(ErrorCode.MOMENT_LIMIT, `You can have ${MAX_ACTIVE_MOMENTS} moments at a time`, HttpStatus.TOO_MANY_REQUESTS, { max: MAX_ACTIVE_MOMENTS });
    const now = this.clock.now();
    const key = `moments/${userId}/${now.getTime()}.${ext}`;
    const url = await this.storage.put(key, file.buffer, file.mimetype);
    const m = await this.prisma.moment.create({ data: { userId, mediaKey: key, mediaUrl: url, caption: caption.trim().slice(0, 120), createdAt: now, expiresAt: new Date(now.getTime() + LIFETIME_MS) } });
    await this.announce(userId);
    return this.dto(m, true, true);
  }

  /** `moments:new` to followers and friends who are online right now (no push). */
  private async announce(authorId: string): Promise<void> {
    const audience = await this.audienceOf(authorId);
    if (!audience.length) return;
    const online = await this.realtime.onlineMap(audience);
    this.realtime.toUsers(audience.filter((id) => online[id]), ServerEvent.MomentNew, { authorId });
  }

  /** Who may see `authorId`'s moments: active followers ∪ friends, minus blocks. */
  private async audienceOf(authorId: string): Promise<string[]> {
    const [followers, friends, excluded] = await Promise.all([
      this.prisma.follow.findMany({ where: { followeeId: authorId, status: FollowStatus.ACTIVE }, select: { followerId: true } }),
      this.prisma.friendship.findMany({ where: { OR: [{ userLowId: authorId }, { userHighId: authorId }], status: FriendshipStatus.ACCEPTED }, select: { userLowId: true, userHighId: true } }),
      this.blocks.excluded(authorId),
    ]);
    const ids = new Set([...followers.map((f) => f.followerId), ...friends.map((f) => (f.userLowId === authorId ? f.userHighId : f.userLowId))]);
    return [...ids].filter((id) => !excluded.has(id));
  }

  /** People whose moments `me` sees: who I follow (active) ∪ my friends, minus blocks. */
  private async authorsFor(me: string): Promise<string[]> {
    const [following, friends, excluded] = await Promise.all([
      this.prisma.follow.findMany({ where: { followerId: me, status: FollowStatus.ACTIVE }, select: { followeeId: true } }),
      this.prisma.friendship.findMany({ where: { OR: [{ userLowId: me }, { userHighId: me }], status: FriendshipStatus.ACCEPTED }, select: { userLowId: true, userHighId: true } }),
      this.blocks.excluded(me),
    ]);
    const ids = new Set([...following.map((f) => f.followeeId), ...friends.map((f) => (f.userLowId === me ? f.userHighId : f.userLowId))]);
    return [...ids].filter((id) => !excluded.has(id) && id !== me);
  }

  private async canSee(viewer: string, authorId: string): Promise<boolean> {
    if (viewer === authorId) return true;
    return (await this.authorsFor(viewer)).includes(authorId);
  }

  /**
   * Your moments, then each author's live moments (oldest first, story
   * order). Authors with something unseen come first, then by newest moment.
   */
  async feed(me: string): Promise<MomentsFeed> {
    const authors = await this.authorsFor(me);
    const [mine, theirs] = await Promise.all([
      this.prisma.moment.findMany({ where: { userId: me, ...this.live() }, orderBy: { createdAt: 'asc' } }),
      authors.length ? this.prisma.moment.findMany({ where: { userId: { in: authors }, ...this.live(), user: { status: UserStatus.ACTIVE } }, orderBy: { createdAt: 'asc' } }) : Promise.resolve([] as Moment[]),
    ]);
    const seen = theirs.length ? new Set((await this.prisma.momentView.findMany({ where: { viewerId: me, momentId: { in: theirs.map((m) => m.id) } }, select: { momentId: true } })).map((v) => v.momentId)) : new Set<string>();
    const byAuthor = new Map<string, Moment[]>();
    for (const m of theirs) byAuthor.set(m.userId, [...(byAuthor.get(m.userId) ?? []), m]);
    const users = byAuthor.size ? await this.prisma.user.findMany({ where: { id: { in: [...byAuthor.keys()] } }, include: PROFILE_INCLUDE }) : [];
    const now = this.clock.now();
    const people = users.map((u) => {
      const list = byAuthor.get(u.id)!;
      const moments = list.map((m) => this.dto(m, seen.has(m.id), false));
      return { author: toPublicProfile(u, now), moments, allSeen: moments.every((m) => m.seen), newest: list[list.length - 1].createdAt.getTime() };
    });
    people.sort((a, b) => Number(a.allSeen) - Number(b.allSeen) || b.newest - a.newest);
    return { mine: mine.map((m) => this.dto(m, true, true)), people: people.map(({ newest: _, ...p }) => p) };
  }

  /** A live moment `viewer` may see, or MOMENT_NOT_FOUND. */
  private async visible(viewer: string, id: string): Promise<Moment> {
    const m = await this.prisma.moment.findUnique({ where: { id } });
    if (!m || m.deletedAt || m.expiresAt <= this.clock.now() || !(await this.canSee(viewer, m.userId))) throw new AppError(ErrorCode.MOMENT_NOT_FOUND, 'This moment is no longer available', HttpStatus.NOT_FOUND);
    return m;
  }

  /** Marks it seen; the author's view count goes up once per viewer. */
  async view(viewer: string, id: string): Promise<{ seen: true; viewsCount?: number }> {
    const m = await this.visible(viewer, id);
    if (m.userId === viewer) return { seen: true, viewsCount: m.viewsCount };
    const created = await this.prisma.momentView.createMany({ data: [{ momentId: id, viewerId: viewer }], skipDuplicates: true });
    if (created.count) await this.prisma.moment.update({ where: { id }, data: { viewsCount: { increment: 1 } } });
    return { seen: true };
  }

  async viewers(me: string, id: string): Promise<{ profile: PublicProfile; at: string }[]> {
    const m = await this.prisma.moment.findUnique({ where: { id } });
    if (!m || m.userId !== me || m.deletedAt) throw new AppError(ErrorCode.MOMENT_NOT_FOUND, 'This moment is no longer available', HttpStatus.NOT_FOUND);
    const views = await this.prisma.momentView.findMany({ where: { momentId: id }, orderBy: { createdAt: 'desc' }, take: 500 });
    const excluded = await this.blocks.excluded(me);
    const users = await this.prisma.user.findMany({ where: { id: { in: views.map((v) => v.viewerId).filter((x) => !excluded.has(x)) }, status: UserStatus.ACTIVE }, include: PROFILE_INCLUDE });
    const byId = new Map(users.map((u) => [u.id, u]));
    const now = this.clock.now();
    return views.flatMap((v) => (byId.has(v.viewerId) ? [{ profile: toPublicProfile(byId.get(v.viewerId)!, now), at: v.createdAt.toISOString() }] : []));
  }

  async remove(me: string, id: string): Promise<void> {
    const m = await this.prisma.moment.findUnique({ where: { id } });
    if (!m || m.userId !== me || m.deletedAt) throw new AppError(ErrorCode.MOMENT_NOT_FOUND, 'This moment is no longer available', HttpStatus.NOT_FOUND);
    await this.prisma.moment.update({ where: { id }, data: { deletedAt: this.clock.now() } });
    await this.storage.delete(m.mediaKey).catch(() => undefined);
  }

  /** A report against the author, noting which moment. */
  async report(me: string, id: string, input: { reason: ReportReason; note?: string; block?: boolean }) {
    const m = await this.visible(me, id);
    if (m.userId === me) throw AppError.forbidden("You can't report yourself");
    const note = `Moment ${m.id}${input.note?.trim() ? `: ${input.note.trim()}` : ''}`.slice(0, 500);
    return this.moderation.report(me, { userId: m.userId, reason: input.reason, note, block: input.block });
  }

  /** Hourly: delete expired (and deleted) moments, their views and media. */
  @Interval(MS.hour)
  async cleanup(): Promise<number> {
    const r = await this.redis.withLock('moments-cleanup', 10 * MS.minute, async () => {
      let removed = 0;
      for (;;) {
        const rows = await this.prisma.moment.findMany({ where: { OR: [{ expiresAt: { lte: this.clock.now() } }, { deletedAt: { not: null } }] }, select: { id: true, mediaKey: true, deletedAt: true }, take: 500 });
        if (!rows.length) break;
        await this.prisma.moment.deleteMany({ where: { id: { in: rows.map((x) => x.id) } } });
        // Deleted ones lost their media when deleted; best effort for the rest.
        await Promise.all(rows.filter((x) => !x.deletedAt).map((x) => this.storage.delete(x.mediaKey).catch(() => undefined)));
        removed += rows.length;
        if (rows.length < 500) break;
      }
      return removed;
    });
    if (r) this.logger.log(`Removed ${r} expired moments`);
    return r ?? 0;
  }
}
