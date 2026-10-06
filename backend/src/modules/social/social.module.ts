import { Module } from '@nestjs/common';

import { WalletModule } from '../wallet/wallet.module';
import { BlocksService } from './blocks.service';
import { FollowsController, MyFollowsController } from './follows.controller';
import { FollowsService } from './follows.service';
import { FriendsService } from './friends.service';
import { LikesService } from './likes.service';
import { MessagesService } from './messages.service';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { BlocksController, FriendsController, LikesController } from './social.controller';
import { StreakService } from './streak.service';

@Module({
  imports: [WalletModule],
  controllers: [FriendsController, BlocksController, LikesController, FollowsController, MyFollowsController, ProfilesController],
  providers: [BlocksService, FriendsService, MessagesService, LikesService, FollowsService, ProfilesService, StreakService],
  exports: [BlocksService, FriendsService, MessagesService, FollowsService, StreakService],
})
export class SocialModule {}
