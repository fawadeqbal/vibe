import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Campaign, CampaignStatus, DeliveryStatus } from '@prisma/client';

import { Clock } from '../../common/utils/clock';
import { AppConfig } from '../../config/app-config.service';
import { MailProvider } from '../../infra/mail/mail.provider';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { RedisService } from '../../infra/redis/redis.service';
import { SettingsService } from '../settings/settings.service';
import { audienceWhere, AudienceSpec, Segment } from './audience';
import { renderMail } from './mail-renderer';
import { CampaignsService } from './campaigns.service';
import { unsubscribeUrl } from './unsubscribe';

const BATCH = 100;
const TICK_BUDGET_MS = 20_000;
const LOCK_MS = 60_000;
const MAIL_CONCURRENCY = 4;

type Recipient = { id: string; name: string; email: string | null; marketingEmails: boolean };

/**
 * Sends queued messages in the background, on one instance at a time
 * (Redis lock). Recipients are walked in user-id order in batches; the
 * last id is saved after each batch, so a crash or deploy resumes exactly
 * where it stopped. One delivery row per person makes a resend impossible.
 * E-mail is paced by the "Message e-mails per minute" setting, shared by
 * every instance, so Gmail (or any provider) limits are respected.
 */
@Injectable()
export class CampaignWorker {
  private readonly logger = new Logger(CampaignWorker.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mail: MailProvider,
    private readonly realtime: RealtimeService,
    private readonly settings: SettingsService,
    private readonly campaigns: CampaignsService,
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  /** Wakes up every few seconds; also called right after a message is queued. */
  @Interval(3000)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.redis.withLock('campaign-worker', LOCK_MS, () => this.work(Date.now() + TICK_BUDGET_MS));
    } catch (e) {
      this.logger.error({ err: e }, 'Campaign worker failed');
    } finally {
      this.running = false;
    }
  }

  private async work(deadline: number): Promise<void> {
    while (Date.now() < deadline) {
      const c = await this.prisma.campaign.findFirst({ where: { status: { in: [CampaignStatus.QUEUED, CampaignStatus.SENDING] } }, orderBy: { createdAt: 'asc' } });
      if (!c) return;
      if (c.status === CampaignStatus.QUEUED) await this.prisma.campaign.update({ where: { id: c.id }, data: { status: CampaignStatus.SENDING, startedAt: this.clock.now() } });
      const more = await this.batch(c, deadline);
      if (more === 'throttled') return; // e-mail budget used up for this minute
    }
  }

  /** One batch. Returns 'done' | 'more' | 'throttled'. */
  private async batch(c: Campaign, deadline: number): Promise<'done' | 'more' | 'throttled'> {
    const spec: AudienceSpec = { audience: c.audience, userIds: c.userIds, segment: c.segment as Segment | null };
    const users: Recipient[] = await this.prisma.user.findMany({
      where: { AND: [audienceWhere(spec, this.clock.now()), c.cursor ? { id: { gt: c.cursor } } : {}] },
      orderBy: { id: 'asc' },
      take: BATCH,
      select: { id: true, name: true, email: true, marketingEmails: true },
    });
    if (!users.length) {
      await this.prisma.campaign.updateMany({ where: { id: c.id, status: CampaignStatus.SENDING }, data: { status: CampaignStatus.SENT, finishedAt: this.clock.now() } });
      this.logger.log(`Message "${c.name}" finished`);
      return 'done';
    }

    let inApp = 0;
    if (c.sendInApp) inApp = await this.deliverInApp(c, users);

    let handled = users.length;
    const counts = { sent: 0, failed: 0, skipped: 0 };
    if (c.sendEmail) {
      const r = await this.deliverEmail(c, users, deadline);
      handled = r.handled;
      Object.assign(counts, r.counts);
    }

    // Still running? (staff may have cancelled meanwhile)
    const lastId = users[handled - 1]?.id ?? c.cursor;
    const updated = await this.prisma.campaign.updateMany({
      where: { id: c.id, status: CampaignStatus.SENDING },
      data: {
        cursor: lastId,
        processed: { increment: handled },
        inAppSent: { increment: inApp },
        emailSent: { increment: counts.sent },
        emailFailed: { increment: counts.failed },
        emailSkipped: { increment: counts.skipped },
        lastError: null,
      },
    });
    if (updated.count === 0) return 'done';
    if (handled < users.length) return 'throttled';
    if (users.length < BATCH) {
      await this.prisma.campaign.updateMany({ where: { id: c.id, status: CampaignStatus.SENDING }, data: { status: CampaignStatus.SENT, finishedAt: this.clock.now() } });
      this.logger.log(`Message "${c.name}" finished`);
      return 'done';
    }
    return 'more';
  }

  private async deliverInApp(c: Campaign, users: Recipient[]): Promise<number> {
    const already = new Set((await this.prisma.userMessage.findMany({ where: { campaignId: c.id, userId: { in: users.map((u) => u.id) } }, select: { userId: true } })).map((m) => m.userId));
    const fresh = users.filter((u) => !already.has(u.id));
    if (!fresh.length) return 0;
    await this.prisma.userMessage.createMany({
      data: fresh.map((u) => ({ userId: u.id, campaignId: c.id, ...this.campaigns.inAppFor(c, { name: u.name || 'there', email: u.email ?? '' }) })),
      skipDuplicates: true,
    });
    // Live banner for whoever is online; the app re-reads its inbox.
    for (const u of fresh) this.realtime.toUser(u.id, ServerEvent.InboxMessage, { campaignId: c.id, ...this.campaigns.inAppFor(c, { name: u.name || 'there', email: u.email ?? '' }) });
    return fresh.length;
  }

  private async deliverEmail(c: Campaign, users: Recipient[], deadline: number) {
    const counts = { sent: 0, failed: 0, skipped: 0 };
    const done = new Set((await this.prisma.messageDelivery.findMany({ where: { campaignId: c.id, userId: { in: users.map((u) => u.id) } }, select: { userId: true } })).map((d) => d.userId));
    const perMinute = await this.settings.get('mail.perMinute');
    const fields = this.campaigns.emailFields(c);
    let handled = 0;

    for (let i = 0; i < users.length; i += MAIL_CONCURRENCY) {
      const group = users.slice(i, i + MAIL_CONCURRENCY);
      const toSend = group.filter((u) => !done.has(u.id) && u.email && (c.important || u.marketingEmails));
      // Pace across instances: reserve slots in this minute's budget.
      if (toSend.length) {
        const minute = Math.floor(Date.now() / 60_000);
        const used = await this.redis.client.incrby(`mail:rate:${minute}`, toSend.length);
        await this.redis.client.expire(`mail:rate:${minute}`, 90);
        if (used > perMinute || Date.now() > deadline) {
          await this.redis.client.decrby(`mail:rate:${minute}`, toSend.length);
          return { handled, counts };
        }
      }
      await Promise.all(
        group.map(async (u) => {
          if (done.has(u.id)) return;
          if (!u.email || !(c.important || u.marketingEmails)) {
            counts.skipped++;
            await this.record(c.id, u, DeliveryStatus.SKIPPED, u.email ? 'Turned off e-mail updates' : 'No e-mail address');
            return;
          }
          const unsub = unsubscribeUrl(this.config.get('PUBLIC_URL'), u.id, this.config.get('JWT_ACCESS_SECRET'));
          const m = renderMail(fields, { name: u.name || 'there', email: u.email }, { unsubscribeUrl: c.important ? undefined : unsub });
          try {
            await this.mail.send({
              to: u.email,
              subject: m.subject,
              html: m.html,
              text: m.text,
              headers: c.important ? undefined : { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
            });
            counts.sent++;
            await this.record(c.id, u, DeliveryStatus.SENT);
          } catch (e) {
            counts.failed++;
            await this.record(c.id, u, DeliveryStatus.FAILED, (e as Error).message);
          }
        }),
      );
      handled += group.length;
    }
    return { handled, counts };
  }

  private async record(campaignId: string, u: Recipient, status: DeliveryStatus, error?: string): Promise<void> {
    await this.prisma.messageDelivery.upsert({
      where: { campaignId_userId: { campaignId, userId: u.id } },
      create: { campaignId, userId: u.id, email: u.email, status, error: error?.slice(0, 300) },
      update: { status, error: error?.slice(0, 300) },
    });
  }
}
