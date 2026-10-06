import { Module } from '@nestjs/common';

import { PushModule } from '../push/push.module';
import { SocialModule } from '../social/social.module';
import { EngagementController } from './engagement.controller';
import { EngagementNotifier } from './engagement-notifier.service';
import { RecapService } from './recap.service';

/** Engagement endpoints and the daily reminder jobs (Vibe Hour, streaks, win-back, recap). */
@Module({
  imports: [SocialModule, PushModule],
  controllers: [EngagementController],
  providers: [EngagementNotifier, RecapService],
  exports: [EngagementNotifier, RecapService],
})
export class EngagementModule {}
