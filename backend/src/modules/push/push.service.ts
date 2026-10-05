import { Injectable, Logger } from '@nestjs/common';

import { Clock } from '../../common/utils/clock';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Integration, IntegrationMode, IntegrationReporter, IntegrationStatus, missingKeys, ProviderSwitch, resolveMode } from '../../integrations/core/integration.types';
import { readServiceAccount } from '../../integrations/core/secrets';
import { GoogleAuth } from '../../integrations/google/google-auth';
import { DevPushSender, FcmPushSender, PushMessage, PushSender } from './push-sender';

const MAX_TOKENS_PER_USER = 10;

/** Device tokens and sending. Which events become notifications lives in PushBridge. */
@Integration()
@Injectable()
export class PushService implements IntegrationReporter {
  private readonly logger = new Logger(PushService.name);
  readonly mode: IntegrationMode;
  readonly sender?: PushSender;
  private readonly required: string[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly clock: Clock,
    googleAuth: GoogleAuth,
  ) {
    const saKey = config.get('FCM_SERVICE_ACCOUNT_JSON') ? 'FCM_SERVICE_ACCOUNT_JSON' : 'GOOGLE_SERVICE_ACCOUNT_JSON';
    this.required = ['FCM_PROJECT_ID', saKey];
    this.mode = resolveMode(config.get('PUSH_PROVIDER') as ProviderSwitch, missingKeys(config.env, this.required).length === 0, config.isProduction);
    if (this.mode === 'live') this.sender = new FcmPushSender(config.get('FCM_PROJECT_ID'), readServiceAccount(config.get(saKey as 'FCM_SERVICE_ACCOUNT_JSON'))!, googleAuth);
    else if (this.mode === 'dev') this.sender = new DevPushSender();
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

  /** Sends to every device of the user; drops tokens FCM says are dead. Never throws. */
  async sendToUser(userId: string, msg: PushMessage): Promise<number> {
    if (!this.sender) return 0;
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

  integrationStatus(): IntegrationStatus {
    return {
      key: 'push.fcm',
      kind: 'push',
      label: 'Push notifications (FCM)',
      mode: this.mode,
      requiredEnv: this.required,
      missingEnv: missingKeys(this.config.env, this.required),
      notes: ['The app also needs its Firebase config (dart-defines FIREBASE_*; see INTEGRATIONS.md).'],
    };
  }
}
