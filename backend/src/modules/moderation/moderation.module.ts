import { Module } from '@nestjs/common';

import { SocialModule } from '../social/social.module';
import { ReportsController } from './moderation.controller';
import { ModerationService } from './moderation.service';

@Module({
  imports: [SocialModule],
  controllers: [ReportsController],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
