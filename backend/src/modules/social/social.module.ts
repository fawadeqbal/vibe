import { Module } from '@nestjs/common';

import { WalletModule } from '../wallet/wallet.module';
import { BlocksService } from './blocks.service';
import { FriendsService } from './friends.service';
import { LikesService } from './likes.service';
import { MessagesService } from './messages.service';
import { BlocksController, FriendsController, LikesController } from './social.controller';

@Module({
  imports: [WalletModule],
  controllers: [FriendsController, BlocksController, LikesController],
  providers: [BlocksService, FriendsService, MessagesService, LikesService],
  exports: [BlocksService, FriendsService, MessagesService],
})
export class SocialModule {}
