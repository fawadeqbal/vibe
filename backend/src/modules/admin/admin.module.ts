import { AdminEconomyController } from './economy/admin-economy.controller';
import { Module } from '@nestjs/common';

import { AnnouncementsModule } from '../announcements/announcements.module';
import { MessagingModule } from '../messaging/messaging.module';
import { MatchingModule } from '../matching/matching.module';
import { ModerationModule } from '../moderation/moderation.module';
import { PaymentsModule } from '../payments/payments.module';
import { UsersModule } from '../users/users.module';
import { WalletModule } from '../wallet/wallet.module';
import { AuditController } from './audit/audit.controller';
import { StaffAuthController } from './auth/staff-auth.controller';
import { StaffAuthService } from './auth/staff-auth.service';
import { StaffTokenService } from './auth/staff-token.service';
import { AdminCoreModule } from './core/admin-core.module';
import { AdminMessagesController } from './messaging/admin-messages.controller';
import { AdminTemplatesController } from './messaging/admin-templates.controller';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { FinanceController } from './finance/finance.controller';
import { FinanceService } from './finance/finance.service';
import { AdminReportsController } from './moderation/admin-reports.controller';
import { AdminReportsService } from './moderation/admin-reports.service';
import { OpsController } from './ops/ops.controller';
import { TeamController } from './team/team.controller';
import { TeamService } from './team/team.service';
import { AdminUsersController } from './users/admin-users.controller';
import { AdminUsersService } from './users/admin-users.service';

/**
 * The back office, under /v1/admin. Each feature is a controller + service
 * pair on top of AdminCoreModule (staff auth, permissions, audit) and the
 * same domain services the app uses — no second copy of business rules.
 */
@Module({
  imports: [AdminCoreModule, UsersModule, WalletModule, PaymentsModule, ModerationModule, MatchingModule, AnnouncementsModule, MessagingModule],
  controllers: [StaffAuthController, TeamController, AuditController, DashboardController, AdminUsersController, AdminReportsController, FinanceController, OpsController, AdminTemplatesController, AdminMessagesController, AdminEconomyController],
  providers: [StaffTokenService, StaffAuthService, TeamService, DashboardService, AdminUsersService, AdminReportsService, FinanceService],
})
export class AdminModule {}
