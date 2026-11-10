import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';

import { Clock } from '../../common/utils/clock';
import { AppConfig } from '../../config/app-config.service';
import { MailProvider } from '../../infra/mail/mail.provider';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { RedisService } from '../../infra/redis/redis.service';
import { MailTemplatesService } from '../messaging/mail-templates.service';
import { unsubscribeUrl } from '../messaging/unsubscribe';
import { PushService } from '../push/push.service';
import { ActivityFeedService } from './activity-feed.service';
import { BuildCtx, CATALOG, CATALOG_BY_KEY, Channel, CHANNELS, Content, GROUP_PUSH, GROUPS, NotificationType, NotifyGroup, TYPES_BY_EVENT, webPath } from './catalog';

/** Staff changes per type: Admin → Configuration → Notifications. */
export const NOTIFY_SETTING_KEY = 'notifications.types';
const RELOAD_MS = 30_000;
const STATS_DAYS = 35;
/** E-mail for these goes even to people who turned e-mail updates off (receipts, safety). */
const TRANSACTIONAL: ReadonlySet<NotifyGroup> = new Set(['money', 'account']);

export type ChannelSwitches = Record<Channel, boolean>;
type Overrides = Record<string, Partial<ChannelSwitches>>;
export type NotifyPrefs = Partial<Record<NotifyGroup, Partial<ChannelSwitches>>>;

export interface NotifyResult {
  /** Devices the push reached. */
  push: number;
  inApp: boolean;
  email: boolean;
}

const NOTHING: NotifyResult = { push: 0, inApp: false, email: false };

/**
 * The one place notifications go out. `notify(userId, type, data)` looks the
 * type up in the catalog, checks what staff turned on, what the person
 * turned off, and whether they are in the app right now, then delivers:
 *
 *  - push: phone (FCM) — skipped while the app is open, unless the type says
 *    otherwise; quiet hours and the daily reminder cap apply (PushService)
 *  - in-app: a message in the person's inbox (Chats → Messages from Vibe)
 *  - e-mail: money and account e-mails always; everything else only to
 *    people we can't reach any other way (no app, not online), with e-mail
 *    updates on, once a day per type
 *
 * Realtime events listed in the catalog notify by themselves.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger('Notifications');
  private cached: { o: Overrides; at: number } | null = null;
  private readonly inFlight = new Set<Promise<NotifyResult>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
    private readonly push: PushService,
    private readonly mail: MailProvider,
    private readonly templates: MailTemplatesService,
    private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly feed: ActivityFeedService,
  ) {}

  onModuleInit(): void {
    this.realtime.onUserEvent((userId, event, payload) => {
      for (const t of TYPES_BY_EVENT.get(event) ?? []) void this.notify(userId, t.key, (payload ?? {}) as Record<string, unknown>);
    });
  }

  /** Sends one notification. Never throws (notifications are best effort). */
  async notify(userId: string, key: string, data: Record<string, unknown> = {}, opts: { online?: boolean } = {}): Promise<NotifyResult> {
    const type = CATALOG_BY_KEY.get(key);
    if (!type) {
      this.logger.warn(`unknown notification type "${key}"`);
      return NOTHING;
    }
    const job = this.deliver(userId, type, data, opts).catch((e: Error) => {
      this.logger.warn(`${key} to ${userId} failed: ${e.message}`);
      return NOTHING;
    });
    this.inFlight.add(job);
    void job.finally(() => this.inFlight.delete(job));
    return job;
  }

  /** Waits until every notification started so far has gone out (tests, shutdown). */
  async settled(): Promise<void> {
    while (this.inFlight.size) await Promise.all([...this.inFlight]);
  }

  private async deliver(userId: string, type: NotificationType, data: Record<string, unknown>, opts: { online?: boolean }): Promise<NotifyResult> {
    const on = await this.channelsFor(type);
    if (!on.push && !on.inApp && !on.email && type.feed !== 'person' && type.feed !== 'system') return NOTHING;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true, isBot: true, name: true, email: true, marketingEmails: true, notifyPrefs: true } });
    if (!user || user.isBot || user.status !== UserStatus.ACTIVE) return NOTHING;
    const prefs = userChannels(user.notifyPrefs, type.group);
    const want = { push: on.push && prefs.push, inApp: on.inApp && prefs.inApp, email: on.email && prefs.email && !!user.email };

    // Only ask "online?" when it matters (it's what the app's own UI covers).
    const needsOnline = (want.push && !type.pushWhenOnline) || (want.email && !TRANSACTIONAL.has(type.group));
    const online = needsOnline ? (opts.online ?? (await this.realtime.isOnline(userId))) : false;
    if (online && !type.pushWhenOnline) want.push = false;
    if (want.email && !TRANSACTIONAL.has(type.group) && (online || !user.marketingEmails)) want.email = false;
    // The Notifications page keeps `feed` types even when no channel goes out (e.g. no push while you're in the app).
    const always = type.feed === 'person' || type.feed === 'system';
    if (!want.push && !want.inApp && !want.email && !always) return NOTHING;

    const content = await type.build(data, this.ctx(userId));
    if (!content) return NOTHING;
    if (always) await this.feed.record(userId, type, content);
    if (!want.push && !want.inApp && !want.email) return NOTHING;

    const result: NotifyResult = { push: 0, inApp: false, email: false };
    if (want.push) {
      const g = GROUP_PUSH[type.group];
      result.push = await this.push.sendToUser(userId, { title: content.title, body: content.body, data: content.data, category: g.category, collapseKey: content.collapseKey, urgent: g.urgent });
      // Every other push lands on the Notifications page too (chat lines collapse per chat).
      if (result.push > 0 && !type.feed) await this.feed.record(userId, type, content);
    }
    if (want.inApp) result.inApp = await this.toInbox(userId, content);
    if (want.email) result.email = await this.toEmail(userId, user, type, content, result.push > 0);

    await this.count(type.key, result);
    return result;
  }

  private ctx(userId: string): BuildCtx {
    return {
      userId,
      prisma: this.prisma,
      once: async (key, seconds = 86_400) => (await this.redis.client.set(`notify:once:${key}`, '1', 'EX', seconds, 'NX')) === 'OK',
    };
  }

  private async toInbox(userId: string, c: Content): Promise<boolean> {
    const path = webPath(c.data);
    const target = c.data.open ?? c.data.route;
    const button = target && target !== 'inbox' ? { label: c.button ?? 'Open', url: this.webUrl(path) } : { label: '', url: '' };
    const msg = await this.prisma.userMessage.create({ data: { userId, title: c.title.slice(0, 200), body: (c.detail ?? c.body).slice(0, 5000), buttonLabel: button.label, buttonUrl: button.url } });
    // fromCenter: the inbox push type ignores it (the push channel already ran).
    this.realtime.toUser(userId, ServerEvent.InboxMessage, { id: msg.id, campaignId: null, title: msg.title, body: msg.body, buttonLabel: msg.buttonLabel || null, buttonUrl: msg.buttonUrl || null, fromCenter: true });
    return true;
  }

  private async toEmail(userId: string, user: { name: string; email: string | null }, type: NotificationType, c: Content, pushed: boolean): Promise<boolean> {
    const transactional = TRANSACTIONAL.has(type.group);
    if (!transactional) {
      // A push reached them, or they have the app: no e-mail needed.
      if (pushed || (await this.prisma.pushToken.findFirst({ where: { userId }, select: { id: true } }))) return false;
      if ((await this.redis.client.set(`notify:mail:${type.key}:${userId}:${this.clock.dayIndex()}`, '1', 'EX', 2 * 86_400, 'NX')) !== 'OK') return false;
    }
    try {
      const unsub = transactional ? undefined : unsubscribeUrl(this.config.get('PUBLIC_URL'), userId, this.config.get('JWT_ACCESS_SECRET'));
      const m = await this.templates.render(
        'notification',
        { name: user.name || 'there', email: user.email, title: c.title, message: c.detail ?? c.body, buttonLabel: c.button ?? 'Open Vibe', buttonUrl: this.webUrl(webPath(c.data)) },
        { unsubscribeUrl: unsub },
      );
      await this.mail.send({ to: user.email!, subject: m.subject, html: m.html, text: m.text, ...(unsub ? { headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}) });
      return true;
    } catch (e) {
      this.logger.warn(`${type.key} e-mail to ${userId} failed: ${(e as Error).message}`);
      return false;
    }
  }

  private webUrl(path: string): string {
    return `${this.config.get('WEB_APP_URL').replace(/\/$/, '')}${path}`;
  }

  // ── stats ────────────────────────────────────────────────────────────

  private async count(key: string, r: NotifyResult): Promise<void> {
    const fields = [r.push > 0 ? 'push' : null, r.inApp ? 'inApp' : null, r.email ? 'email' : null].filter(Boolean) as string[];
    if (!fields.length) return;
    const h = `notify:stats:${this.clock.dayIndex()}`;
    const m = this.redis.client.multi();
    for (const f of fields) m.hincrby(h, `${key}|${f}`, 1);
    m.expire(h, STATS_DAYS * 86_400);
    await m.exec();
  }

  /** Sent per type and channel over the last `days` days. */
  async stats(days: number): Promise<Record<string, ChannelSwitchesCount>> {
    const today = this.clock.dayIndex();
    const rows = await Promise.all(Array.from({ length: days }, (_, i) => this.redis.client.hgetall(`notify:stats:${today - i}`)));
    const out: Record<string, ChannelSwitchesCount> = {};
    for (const row of rows) {
      for (const [field, n] of Object.entries(row ?? {})) {
        const [key, ch] = field.split('|') as [string, Channel];
        (out[key] ??= { push: 0, inApp: 0, email: 0 })[ch] += Number(n) || 0;
      }
    }
    return out;
  }

  // ── staff switches ───────────────────────────────────────────────────

  /** Forget the cached staff switches (tests). */
  invalidate(): void {
    this.cached = null;
  }

  private async overrides(): Promise<Overrides> {
    if (this.cached && Date.now() - this.cached.at < RELOAD_MS) return this.cached.o;
    const row = await this.prisma.appSetting.findUnique({ where: { key: NOTIFY_SETTING_KEY } });
    const o = (row?.value && typeof row.value === 'object' ? row.value : {}) as Overrides;
    this.cached = { o, at: Date.now() };
    return o;
  }

  async channelsFor(type: NotificationType): Promise<ChannelSwitches> {
    const o = (await this.overrides())[type.key] ?? {};
    return { push: o.push ?? type.channels.push, inApp: o.inApp ?? type.channels.inApp, email: o.email ?? type.channels.email };
  }

  /** Admin → Configuration → Notifications. */
  async adminView(): Promise<AdminNotificationsView> {
    const [o, week] = await Promise.all([this.overrides(), this.stats(7)]);
    return {
      groups: GROUPS.map((g) => ({ key: g.key, label: g.label })),
      types: CATALOG.map((t) => ({
        key: t.key,
        group: t.group,
        label: t.label,
        auto: !!t.event,
        defaults: t.channels,
        channels: { push: o[t.key]?.push ?? t.channels.push, inApp: o[t.key]?.inApp ?? t.channels.inApp, email: o[t.key]?.email ?? t.channels.email },
        sentLast7Days: week[t.key] ?? { push: 0, inApp: 0, email: 0 },
      })),
    };
  }

  async setChannels(key: string, channels: Partial<ChannelSwitches>, staffId: string): Promise<AdminNotificationsView> {
    const type = CATALOG_BY_KEY.get(key);
    if (!type) throw new Error('unknown type');
    this.cached = null;
    const o = { ...(await this.overrides()) };
    const next = { ...o[key] };
    for (const ch of CHANNELS) {
      if (channels[ch] === undefined) continue;
      // Same as the default = no override (a later default change applies).
      if (channels[ch] === type.channels[ch]) delete next[ch];
      else next[ch] = channels[ch];
    }
    if (Object.keys(next).length) o[key] = next;
    else delete o[key];
    const value = o as Prisma.InputJsonObject;
    await this.prisma.appSetting.upsert({ where: { key: NOTIFY_SETTING_KEY }, create: { key: NOTIFY_SETTING_KEY, value, updatedById: staffId }, update: { value, updatedById: staffId } });
    this.cached = null;
    return this.adminView();
  }

  // ── the person's own choices ─────────────────────────────────────────

  async prefsView(userId: string): Promise<MyNotificationsView> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { notifyPrefs: true, email: true, marketingEmails: true, quietHoursStart: true, quietHoursEnd: true } });
    return {
      hasEmail: !!u.email,
      emailUpdates: u.marketingEmails,
      quietHours: { start: u.quietHoursStart, end: u.quietHoursEnd },
      groups: GROUPS.map((g) => ({ key: g.key, label: g.label, description: g.description, locked: !!g.locked, ...userChannels(u.notifyPrefs, g.key) })),
    };
  }

  async setPref(userId: string, group: NotifyGroup, channel: Channel, on: boolean): Promise<MyNotificationsView> {
    const g = GROUPS.find((x) => x.key === group);
    if (g && !g.locked) {
      const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { notifyPrefs: true } });
      const prefs: NotifyPrefs = { ...cleanPrefs(u.notifyPrefs) };
      const next = { ...prefs[group] };
      if (on) delete next[channel];
      else next[channel] = false;
      if (Object.keys(next).length) prefs[group] = next;
      else delete prefs[group];
      await this.prisma.user.update({ where: { id: userId }, data: { notifyPrefs: Object.keys(prefs).length ? (prefs as Prisma.InputJsonObject) : Prisma.DbNull } });
    }
    return this.prefsView(userId);
  }
}

export type ChannelSwitchesCount = Record<Channel, number>;

export interface AdminNotificationsView {
  groups: { key: NotifyGroup; label: string }[];
  types: { key: string; group: NotifyGroup; label: string; auto: boolean; defaults: ChannelSwitches; channels: ChannelSwitches; sentLast7Days: ChannelSwitchesCount }[];
}

export interface MyNotificationsView {
  hasEmail: boolean;
  emailUpdates: boolean;
  quietHours: { start: number | null; end: number | null };
  groups: ({ key: NotifyGroup; label: string; description: string; locked: boolean } & ChannelSwitches)[];
}

function cleanPrefs(raw: unknown): NotifyPrefs {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as NotifyPrefs) : {};
}

/** What the person allows for a group (account alerts can't be turned off). */
export function userChannels(raw: unknown, group: NotifyGroup): ChannelSwitches {
  if (GROUPS.find((g) => g.key === group)?.locked) return { push: true, inApp: true, email: true };
  const p = cleanPrefs(raw)[group] ?? {};
  return { push: p.push !== false, inApp: p.inApp !== false, email: p.email !== false };
}
