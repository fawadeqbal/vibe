import { Module } from '@nestjs/common';

import { ModerationModule } from '../moderation/moderation.module';
import { SocialModule } from '../social/social.module';
import { WalletModule } from '../wallet/wallet.module';
import { DevBotsService } from './dev-bots.service';
import { MatchGateway } from './match.gateway';
import { MatchQueueService } from './match-queue.service';
import { MatchSessionStore } from './match-session.store';
import { MatchingService } from './matching.service';
import { RtcController } from './rtc.controller';
import { SkipCooldownService } from './skip-cooldown.service';

@Module({
  imports: [WalletModule, SocialModule, ModerationModule],
  controllers: [RtcController],
  providers: [MatchingService, MatchQueueService, MatchSessionStore, SkipCooldownService, MatchGateway, DevBotsService],
  exports: [MatchingService],
})
export class MatchingModule {}
