import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { Clock } from '../../common/utils/clock';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Integration, IntegrationMode, IntegrationReporter, IntegrationStatus, missingKeys, ProviderSwitch, resolveMode } from '../../integrations/core/integration.types';
import { readServiceAccount } from '../../integrations/core/secrets';
import { GoogleAuth } from '../../integrations/google/google-auth';
import { RedisService } from '../../infra/redis/redis.service';
import { EconomyService } from '../catalog/economy.service';
import { DevPushSender, FcmPushSender, PushMessage, PushSender } from './push-sender';
import { PushSettingsService } from './push-settings.service';
import { inQuietHours, QUIET_CATEGORIES } from './quiet-hours';

const MAX_TOKENS_PER_USER = 10;

/** Device tokens and sending. What gets sent, and when, lives in NotificationsService (notifications/catalog.ts). */
@Integration()
@Injectable()
export class PushService implements IntegrationReporter, OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  /** From the server's environment (PUSH_PROVIDER, FCM_*). */
  private readonly envMode: IntegrationMode;
  private readonly envSender?: PushSender;
  /** From Admin → Configuration → Push notifications (wins over the environment). */
  private adminSender: { key: string; sender: FcmPushSender } | null = null;
  private readonly required: string[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly googleAuth: GoogleAuth,
    private readonly redis: RedisService,
    private readonly economy: EconomyService,
    private readonly settings: PushSettingsService,
  ) {
    const saKey = config.get('FCM_SERVICE_ACCOUNT_JSON') ? 'FCM_SERVICE_ACCOUNT_JSON' : 'GOOGLE_SERVICE_ACCOUNT_JSON';
    this.required = ['FCM_PROJECT_ID', saKey];
    this.envMode = resolveMode(config.get('PUSH_PROVIDER') as ProviderSwitch, missingKeys(config.env, this.required).length === 0, config.isProduction);
    if (this.envMode === 'live') this.envSender = new FcmPushSender(config.get('FCM_PROJECT_ID'), readServiceAccount(config.get(saKey as 'FCM_SERVICE_ACCOUNT_JSON'))!, googleAuth);
    else if (this.envMode === 'dev') this.envSender = new DevPushSender();
  }

  /** live when a Firebase key is saved in Admin → Configuration (or set on the server), else dev/off. */
  get mode(): IntegrationMode {
    return this.adminSender ? 'live' : this.envMode;
  }

  /** Who sends right now: the admin-saved Firebase key first, the environment's otherwise. */
  get sender(): PushSender | undefined {
    return this.adminSender?.sender ?? this.envSender;
  }

  async onModuleInit(): Promise<void> {
    await this.refresh().catch(() => undefined);
  }

  /** Picks up a key saved (or removed) in the admin panel. */
  async refresh(): Promise<void> {
    const cfg = await this.settings.current();
    if (!cfg) {
      this.adminSender = null;
      return;
    }
    const key = `${cfg.projectId}|${cfg.account.client_email}|${cfg.account.private_key.length}`;
    if (this.adminSender?.key !== key) this.adminSender = { key, sender: new FcmPushSender(cfg.projectId, cfg.account, this.googleAuth, this.settings.fetchImpl) };
  }

  /** "Send a test notification" from the admin panel: every device of this person, no quiet hours. */
  async sendTest(userId: string): Promise<{ devices: number; delivered: number }> {
    await this.refresh();
    const devices = await this.prisma.pushToken.count({ where: { userId } });
    if (!this.sender) return { devices, delivered: 0 };
    const tokens = await this.prisma.pushToken.findMany({ where: { userId }, select: { token: true } });
    let delivered = 0;
    for (const { token } of tokens) {
      const r = await this.sender.send(token, { title: 'Vibe test notification 🔔', body: 'Push notifications work. You can close this.', data: { route: 'inbox' }, category: 'messages' }).catch(() => 'retry' as const);
      if (r === 'ok') delivered++;
      if (r === 'invalid') await this.prisma.pushToken.deleteMany({ where: { token } });
    }
    return { devices, delivered };
  }

  async register(userId: string, input: { token: string; platform: string; appVersion?: string; locale?: string }): Promise<void> {
    // A token belongs to one device; if someone else signed in on it, it moves to them.
    await this.prisma.pushToken.upsert({
      where: { token: input.token },
      create: { userId, token: input.token, platform: input.platform, appVersion: input.appVersion, locale: input.locale },
      update: { userId, platform: input.platform, appVersion: input.appVersion, locale: input.locale, lastSeenAt: this.clock.now() },
    });
    const extra = await this.prisma.pushToken.findMany({ where: { userId }, orderBy: { lastSeenAt: 'desc' }, skip: MAX_TOKENS_PER_USER, select: { id: true } });
    if (extra.length) await this.prisma.pushToken.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } });
  }

  async unregister(userId: string, token: string): Promise<void> {
    await this.prisma.pushToken.deleteMany({ where: { userId, token } });
  }

  /**
   * Sends to every device of the user; drops tokens FCM says are dead. Never
   * throws. Quiet hours hold back social/engagement/inbox pushes, and
   * engagement pushes (reminders) are capped per user per business day.
   */
  async sendToUser(userId: string, msg: PushMessage): Promise<number> {
    await this.refresh().catch(() => undefined);
    if (!this.sender) return 0;
    if (!(await this.allowed(userId, msg))) return 0;
    const tokens = await this.prisma.pushToken.findMany({ where: { userId }, select: { token: true } });
    let ok = 0;
    await Promise.all(
      tokens.map(async ({ token }) => {
        try {
          const r = await this.sender!.send(token, msg);
          if (r === 'ok') ok++;
          if (r === 'invalid') await this.prisma.pushToken.deleteMany({ where: { token } });
        } catch (e) {
          this.logger.warn(`push to ${token.slice(0, 8)}… failed: ${(e as Error).message}`);
        }
      }),
    );
    return ok;
  }

  private async allowed(userId: string, msg: PushMessage): Promise<boolean> {
    if (!msg.urgent && QUIET_CATEGORIES.has(msg.category)) {
      const q = await this.prisma.user.findUnique({ where: { id: userId }, select: { quietHoursStart: true, quietHoursEnd: true, tzOffsetMinutes: true } });
      if (!q || inQuietHours(this.clock.now().getTime(), q)) return false;
    }
    if (msg.category === 'engagement') {
      const key = `push:engagement:${userId}:${this.clock.dayIndex()}`;
      if ((await this.redis.incrWithTtl(key, 2 * 86_400)) > this.economy.rules.maxEngagementPushesPerDay) return false;
    }
    return true;
  }

  integrationStatus(): IntegrationStatus {
    return {
      key: 'push.fcm',
      kind: 'push',
      label: 'Push notifications (FCM)',
      mode: this.mode,
      requiredEnv: this.adminSender ? [] : this.required,
      missingEnv: this.adminSender ? [] : missingKeys(this.config.env, this.required),
      notes: [
        this.adminSender ? 'Firebase key saved in Admin → Configuration → Push notifications.' : 'Save the Firebase key in Admin → Configuration → Push notifications.',
        'The app also needs its Firebase config (dart-defines FIREBASE_*; see INTEGRATIONS.md).',
      ],
    };
  }
}
