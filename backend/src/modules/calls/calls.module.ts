import { Module } from '@nestjs/common';

import { MatchingModule } from '../matching/matching.module';
import { SocialModule } from '../social/social.module';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';

/** Video calls between friends, from a chat — only when both allowed them. */
@Module({
  imports: [MatchingModule, SocialModule],
  controllers: [CallsController],
  providers: [CallsService],
})
export class CallsModule {}
