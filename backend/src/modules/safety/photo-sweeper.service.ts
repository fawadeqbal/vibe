import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { Clock } from '../../common/utils/clock';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { StorageProvider } from '../../infra/storage/storage.provider';
import { NotificationsService } from '../notifications/notifications.service';
import { ImageSafetyService } from './image-safety.service';

/** Photos checked per run (one run a minute, ~1 s each). */
export const SWEEP_BATCH = 20;
const MAX_FETCH_BYTES = 8 * 1024 * 1024;

export interface SweepResult {
  checked: number;
  removed: number;
  flagged: number;
  /** The check was down: stopped early, tries again next run. */
  paused: boolean;
}

/**
 * Makes sure every photo people can see has been through the nudity check,
 * whenever and however it got there: profile photos and Moments from before
 * the filter existed, and any profile photo set some other way (an import,
 * an admin tool, a future feature). A profile photo counts as checked only
 * for the exact URL that passed (`User.avatarCheckedUrl`).
 *
 * Nude photos are taken down (profile photo cleared and the badge with it,
 * Moment deleted), kept privately as evidence like any blocked upload, and the
 * person is told. They aren't counted as a strike: the photo predates the
 * rule. Borderline ones stay up and go to Reports → Flagged photos.
 */
@Injectable()
export class PhotoSweeperService {
  private readonly log = new Logger(PhotoSweeperService.name);
  /** Swapped in tests (outside photo URLs). */
  http: typeof fetch = (...a) => fetch(...a);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
    private readonly images: ImageSafetyService,
    private readonly notifications: NotificationsService,
    private readonly redis: RedisService,
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  /** Photos still waiting for their first check (admin shows the backlog). */
  async backlog(): Promise<{ avatars: number; moments: number }> {
    const [[a], moments] = await Promise.all([
      this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM "User"
         WHERE "isBot" = false AND status = 'ACTIVE' AND "avatarUrl" <> '' AND ("avatarCheckedUrl" IS NULL OR "avatarCheckedUrl" <> "avatarUrl")`,
      this.prisma.moment.count({ where: { checkedAt: null, deletedAt: null, expiresAt: { gt: this.clock.now() } } }),
    ]);
    return { avatars: Number(a?.n ?? 0), moments };
  }

  @Interval(60_000)
  async tick(): Promise<void> {
    if (this.config.get('NSFW_FILTER') === 'off') return;
    // One instance at a time.
    if ((await this.redis.client.set('photo-sweeper:lock', '1', 'EX', 55, 'NX')) !== 'OK') return;
    try {
      const r = await this.sweep();
      if (r.checked) this.log.log(`Checked ${r.checked} older photos: ${r.removed} taken down, ${r.flagged} for review${r.paused ? ' (check unavailable, paused)' : ''}`);
    } catch (e) {
      this.log.warn(`photo sweep failed: ${(e as Error).message}`);
    } finally {
      await this.redis.client.del('photo-sweeper:lock');
    }
  }

  /** One batch: profile photos first (everyone sees them), then live Moments. */
  async sweep(limit = SWEEP_BATCH): Promise<SweepResult> {
    const out: SweepResult = { checked: 0, removed: 0, flagged: 0, paused: false };
    const users = await this.prisma.$queryRaw<{ id: string; avatarUrl: string }[]>`
      SELECT id, "avatarUrl" FROM "User"
       WHERE "isBot" = false AND status = 'ACTIVE' AND "avatarUrl" <> '' AND ("avatarCheckedUrl" IS NULL OR "avatarCheckedUrl" <> "avatarUrl")
       ORDER BY "lastSeenAt" DESC NULLS LAST
       LIMIT ${limit}`;
    for (const u of users) {
      const r = await this.checkAvatar(u.id, u.avatarUrl);
      if (r === 'paused') return { ...out, paused: true };
      out.checked++;
      if (r === 'removed') out.removed++;
      if (r === 'flagged') out.flagged++;
    }
    const left = limit - users.length;
    if (left <= 0) return out;
    const moments = await this.prisma.moment.findMany({ where: { checkedAt: null, deletedAt: null, expiresAt: { gt: this.clock.now() } }, orderBy: { createdAt: 'desc' }, take: left });
    for (const m of moments) {
      const r = await this.checkMoment(m);
      if (r === 'paused') return { ...out, paused: true };
      out.checked++;
      if (r === 'removed') out.removed++;
      if (r === 'flagged') out.flagged++;
    }
    return out;
  }

  private async checkAvatar(userId: string, url: string): Promise<'ok' | 'removed' | 'flagged' | 'paused'> {
    const bytes = await this.read(url);
    const j = bytes ? await this.images.judge(bytes) : { verdict: 'unreadable' as const, score: null, jpeg: null };
    if (j.verdict === 'unavailable') return 'paused';
    // Only touch the row if the photo is still the same one (they may have changed it meanwhile).
    const same = { id: userId, avatarUrl: url };
    if (j.verdict === 'block') {
      await this.images.recordBlocked(userId, 'avatar', userId, j.jpeg!, j.score!, { strike: false });
      const { count } = await this.prisma.user.updateMany({ where: same, data: { avatarUrl: '', avatarCheckedUrl: null, verified: false, verifiedAt: null } });
      if (count) {
        await this.deletePublic(url);
        void this.notifications.notify(userId, 'account.warning', { message: 'Your profile photo was removed because it showed nudity, which isn’t allowed on Vibe. Add a new photo of your face to match again.' });
      }
      return 'removed';
    }
    if (j.verdict === 'review') await this.flagReview(userId, 'avatar', userId, url, j.score!);
    // Unreadable (missing, not an image) is marked checked too: nothing can be shown from it.
    await this.prisma.user.updateMany({ where: same, data: { avatarCheckedUrl: url } });
    return j.verdict === 'review' ? 'flagged' : 'ok';
  }

  private async checkMoment(m: { id: string; userId: string; mediaKey: string; mediaUrl: string }): Promise<'ok' | 'removed' | 'flagged' | 'paused'> {
    const bytes = (await this.storage.read(m.mediaKey).catch(() => null)) ?? (await this.read(m.mediaUrl));
    const j = bytes ? await this.images.judge(bytes) : { verdict: 'unreadable' as const, score: null, jpeg: null };
    if (j.verdict === 'unavailable') return 'paused';
    const now = this.clock.now();
    if (j.verdict === 'block') {
      await this.images.recordBlocked(m.userId, 'moment', m.mediaKey, j.jpeg!, j.score!, { strike: false });
      await this.prisma.moment.update({ where: { id: m.id }, data: { deletedAt: now, checkedAt: now } });
      await this.storage.delete(m.mediaKey).catch(() => undefined);
      void this.notifications.notify(m.userId, 'account.warning', { message: 'One of your Moments was removed because it showed nudity, which isn’t allowed on Vibe.' });
      return 'removed';
    }
    if (j.verdict === 'review') await this.flagReview(m.userId, 'moment', m.mediaKey, m.mediaUrl, j.score!);
    await this.prisma.moment.update({ where: { id: m.id }, data: { checkedAt: now } });
    return j.verdict === 'review' ? 'flagged' : 'ok';
  }

  private async flagReview(userId: string, place: 'avatar' | 'moment', refId: string, url: string, score: number): Promise<void> {
    await this.prisma.mediaFlag.create({ data: { userId, place, refId, score, action: 'review', key: this.storage.keyFromUrl(url) } }).catch(() => undefined);
  }

  /** Our own storage, or (older imports) an outside link. Null when it can't be read. */
  private async read(url: string): Promise<Buffer | null> {
    const key = this.storage.keyFromUrl(url);
    if (key) return this.storage.read(key).catch(() => null);
    // Redirects are followed by hand so every hop passes the same check.
    let next = url;
    try {
      for (let hop = 0; hop < 4; hop++) {
        if (!isPublicHttps(next)) return null;
        const res = await this.http(next, { signal: AbortSignal.timeout(10_000), redirect: 'manual' });
        const to = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
        if (to) {
          next = new URL(to, next).toString();
          continue;
        }
        if (!res.ok || Number(res.headers.get('content-length') ?? 0) > MAX_FETCH_BYTES) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        return buf.length > MAX_FETCH_BYTES ? null : buf;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async deletePublic(url: string): Promise<void> {
    const key = this.storage.keyFromUrl(url);
    if (key) await this.storage.delete(key).catch(() => undefined);
  }
}

/**
 * Outside links are fetched from our servers, so only public HTTPS hosts:
 * no plain HTTP, no IP addresses, no localhost or internal names (a profile
 * photo URL must never become a way to reach our own network).
 */
export function isPublicHttps(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return false;
  if (/^\d+(\.\d+){3}$/.test(h) || h.startsWith('[') || h.includes(':')) return false;
  return true;
}
