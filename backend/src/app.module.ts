import { Module, RequestMethod } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';

import { CommonModule } from './common/common.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';
import { AppConfig } from './config/app-config.service';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RealtimeModule } from './infra/realtime/realtime.module';
import { MailModule } from './infra/mail/mail.module';
import { RedisModule } from './infra/redis/redis.module';
import { StorageModule } from './infra/storage/storage.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AdminModule } from './modules/admin/admin.module';
import { StaffAuthGuard } from './modules/admin/core/staff-auth.guard';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { HealthModule } from './modules/health/health.module';
import { MatchingModule } from './modules/matching/matching.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PushModule } from './modules/push/push.module';
import { MailTemplatesModule } from './modules/messaging/mail-templates.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { MaintenanceGuard } from './modules/settings/maintenance.guard';
import { SettingsModule } from './modules/settings/settings.module';
import { SocialModule } from './modules/social/social.module';
import { UsersModule } from './modules/users/users.module';
import { WalletModule } from './modules/wallet/wallet.module';

/** pino-pretty is a dev dependency; production images don't ship it. */
function canPrettyPrint(): boolean {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

@Module({
  imports: [
    // Infrastructure
    ConfigModule,
    CommonModule,
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        forRoutes: [{ path: '{*splat}', method: RequestMethod.ALL }],
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          genReqId: (req, res) => {
            const id = (req.headers['x-request-id'] as string) ?? randomUUID();
            res.setHeader('x-request-id', id);
            return id;
          },
          redact: ['req.headers.authorization', 'req.body.refreshToken', 'req.body.code', 'req.body.account', 'req.body.password'],
          transport: config.get('NODE_ENV') === 'development' && canPrettyPrint() ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
          autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
        },
      }),
    }),
    EventEmitterModule.forRoot({ wildcard: false }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: config.get('RATE_LIMIT_PER_MINUTE') }],
        skipIf: () => config.isTest,
      }),
    }),
    PrismaModule,
    RedisModule,
    RealtimeModule,
    StorageModule,
    IntegrationsModule,
    MailModule,
    SettingsModule,
    MailTemplatesModule,

    // Features
    HealthModule,
    CatalogModule,
    AuthModule,
    UsersModule,
    WalletModule,
    PaymentsModule,
    PushModule,
    SocialModule,
    ModerationModule,
    MatchingModule,
    AnnouncementsModule,
    MessagingModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters: authenticate (app users or staff), then rate-limit per
    // caller, then maintenance mode (app routes only), then roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: StaffAuthGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
    { provide: APP_GUARD, useClass: MaintenanceGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
