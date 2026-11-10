import { Module } from '@nestjs/common';

import { SocialModule } from '../social/social.module';
import { AccountStatusController } from './account-status.controller';
import { AppealsController } from './appeals.controller';
import { AppealsService } from './appeals.service';
import { ReportsController } from './moderation.controller';
import { ModerationService } from './moderation.service';

@Module({
  imports: [SocialModule],
  controllers: [ReportsController, AppealsController, AccountStatusController],
  providers: [ModerationService, AppealsService],
  exports: [ModerationService, AppealsService],
})
export class ModerationModule {}
