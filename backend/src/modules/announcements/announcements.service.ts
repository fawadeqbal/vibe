import { Injectable } from '@nestjs/common';
import { Announcement, AnnouncementAudience, AnnouncementStatus } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { Clock } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { RedisService } from '../../infra/redis/redis.service';
import { WalletService } from '../wallet/wallet.service';

const LIVE_CACHE = 'announcements:live';

export const toAnnouncementView = (a: Announcement) => ({
  id: a.id,
  title: a.title,
  body: a.body,
  audience: a.audience,
  status: a.status,
  publishedAt: a.publishedAt?.toISOString() ?? null,
  expiresAt: a.expiresAt?.toISOString() ?? null,
  createdAt: a.createdAt.toISOString(),
});

/**
 * In-app announcements. Staff write a draft, publish it (pushed live to
 * everyone online, and served to anyone who opens the app until it
 * expires or is archived).
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
    private readonly wallet: WalletService,
    private readonly clock: Clock,
  ) {}

  /** What one user should see now (cached list, filtered by audience). */
  async forUser(userId: string) {
    const live = await this.redis.remember(LIVE_CACHE, 30, async () => {
      const rows = await this.prisma.announcement.findMany({
        where: { status: AnnouncementStatus.LIVE, OR: [{ expiresAt: null }, { expiresAt: { gt: this.clock.now() } }] },
        orderBy: { publishedAt: 'desc' },
        take: 10,
      });
      return rows.map(toAnnouncementView);
    });
    const now = this.clock.now().toISOString();
    const active = live.filter((a) => !a.expiresAt || a.expiresAt > now);
    if (!active.some((a) => a.audience !== AnnouncementAudience.ALL)) return active;
    const vip = await this.wallet.isVip(userId);
    return active.filter((a) => a.audience === AnnouncementAudience.ALL || (a.audience === AnnouncementAudience.VIP) === vip);
  }

  list(status?: AnnouncementStatus) {
    return this.prisma.announcement.findMany({ where: { status }, orderBy: { createdAt: 'desc' }, take: 200 }).then((r) => r.map(toAnnouncementView));
  }

  async create(staffId: string, input: { title: string; body: string; audience?: AnnouncementAudience; expiresAt?: string }) {
    const a = await this.prisma.announcement.create({
      data: { title: input.title.trim(), body: input.body.trim(), audience: input.audience ?? AnnouncementAudience.ALL, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null, createdById: staffId },
    });
    return toAnnouncementView(a);
  }

  async update(id: string, input: { title?: string; body?: string; audience?: AnnouncementAudience; expiresAt?: string | null }) {
    const a = await this.find(id);
    if (a.status !== AnnouncementStatus.DRAFT) throw AppError.conflict('Only drafts can be edited. Archive it and write a new one.');
    const updated = await this.prisma.announcement.update({
      where: { id },
      data: { title: input.title?.trim(), body: input.body?.trim(), audience: input.audience, expiresAt: input.expiresAt === undefined ? undefined : input.expiresAt ? new Date(input.expiresAt) : null },
    });
    return toAnnouncementView(updated);
  }

  async publish(id: string) {
    const a = await this.find(id);
    if (a.status !== AnnouncementStatus.DRAFT) throw AppError.conflict('Already published');
    const live = await this.prisma.announcement.update({ where: { id }, data: { status: AnnouncementStatus.LIVE, publishedAt: this.clock.now() } });
    await this.redis.client.del(LIVE_CACHE);
    const view = toAnnouncementView(live);
    // Everyone online sees it now; the app filters VIP-only ones itself via forUser on next open.
    if (live.audience === AnnouncementAudience.ALL) this.realtime.toAll(ServerEvent.Announcement, view);
    return view;
  }

  async archive(id: string) {
    await this.find(id);
    const a = await this.prisma.announcement.update({ where: { id }, data: { status: AnnouncementStatus.ARCHIVED } });
    await this.redis.client.del(LIVE_CACHE);
    return toAnnouncementView(a);
  }

  private async find(id: string): Promise<Announcement> {
    const a = await this.prisma.announcement.findUnique({ where: { id } });
    if (!a) throw AppError.notFound('Announcement');
    return a;
  }
}
