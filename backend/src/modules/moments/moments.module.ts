import { Module } from '@nestjs/common';

import { ModerationModule } from '../moderation/moderation.module';
import { SocialModule } from '../social/social.module';
import { MomentsController } from './moments.controller';
import { MomentsService } from './moments.service';

/** 24-hour photos for followers and friends. */
@Module({
  imports: [SocialModule, ModerationModule],
  controllers: [MomentsController],
  providers: [MomentsService],
  exports: [MomentsService],
})
export class MomentsModule {}
