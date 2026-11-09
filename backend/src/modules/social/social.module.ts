import { Module } from '@nestjs/common';

import { ChatSafetyModule } from '../chat-safety/chat-safety.module';
import { SafetyModule } from '../safety/safety.module';
import { WalletModule } from '../wallet/wallet.module';
import { BlocksService } from './blocks.service';
import { FollowsController, MyFollowsController } from './follows.controller';
import { FollowsService } from './follows.service';
import { FriendsService } from './friends.service';
import { LikesService } from './likes.service';
import { MessagesService } from './messages.service';
import { ProfilesController } from './profiles.controller';
import { PresenceNotifier } from './presence.notifier';
import { ProfilesService } from './profiles.service';
import { BlocksController, FriendsController, LikesController } from './social.controller';
import { StreakService } from './streak.service';

@Module({
  imports: [WalletModule, ChatSafetyModule, SafetyModule],
  controllers: [FriendsController, BlocksController, LikesController, FollowsController, MyFollowsController, ProfilesController],
  providers: [BlocksService, FriendsService, MessagesService, LikesService, FollowsService, ProfilesService, StreakService, PresenceNotifier],
  exports: [BlocksService, FriendsService, MessagesService, FollowsService, StreakService],
})
export class SocialModule {}
