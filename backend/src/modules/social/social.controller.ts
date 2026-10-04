import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OK } from '../../common/dto/ok.dto';
import { CursorQueryDto } from '../../common/dto/pagination.dto';
import { BlocksService } from './blocks.service';
import { SendGiftDto, SendMessageDto } from './dto/social.dto';
import { FriendsService } from './friends.service';
import { LikesService } from './likes.service';
import { MessagesService } from './messages.service';

@ApiTags('friends')
@ApiBearerAuth()
@Controller('friends')
export class FriendsController {
  constructor(
    private readonly friends: FriendsService,
    private readonly messages: MessagesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Friends and pending requests (incoming + sent), most recent chat first' })
  list(@CurrentUser('id') me: string) {
    return this.friends.list(me);
  }

  @Post(':userId/request')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a friend request (3 free a day, then coins); accepts if they asked first' })
  request(@CurrentUser('id') me: string, @Param('userId') userId: string) {
    return this.friends.request(me, userId);
  }

  @Post(':userId/accept')
  @HttpCode(200)
  async accept(@CurrentUser('id') me: string, @Param('userId') userId: string) {
    await this.friends.accept(me, userId);
    return OK;
  }

  @Post(':userId/decline')
  @HttpCode(200)
  async decline(@CurrentUser('id') me: string, @Param('userId') userId: string) {
    await this.friends.decline(me, userId);
    return OK;
  }

  @Delete(':userId')
  async remove(@CurrentUser('id') me: string, @Param('userId') userId: string) {
    await this.friends.remove(me, userId);
    return OK;
  }

  @Get(':userId/messages')
  messagesList(@CurrentUser('id') me: string, @Param('userId') userId: string, @Query() q: CursorQueryDto) {
    return this.messages.list(me, userId, q);
  }

  @Post(':userId/messages')
  send(@CurrentUser('id') me: string, @Param('userId') userId: string, @Body() dto: SendMessageDto) {
    return this.messages.send(me, userId, dto.text);
  }

  @Post(':userId/gifts')
  gift(@CurrentUser('id') me: string, @Param('userId') userId: string, @Body() dto: SendGiftDto, @Headers('idempotency-key') key?: string) {
    return this.messages.sendGift(me, userId, dto.giftId, key);
  }

  @Post(':userId/read')
  @HttpCode(200)
  async read(@CurrentUser('id') me: string, @Param('userId') userId: string) {
    return { marked: await this.messages.markRead(me, userId) };
  }
}

@ApiTags('blocks')
@ApiBearerAuth()
@Controller('blocks')
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Get()
  list(@CurrentUser('id') me: string) {
    return this.blocks.list(me);
  }

  @Post(':userId')
  @HttpCode(200)
  async block(@CurrentUser('id') me: string, @Param('userId') userId: string) {
    await this.blocks.block(me, userId);
    return OK;
  }

  @Delete(':userId')
  async unblock(@CurrentUser('id') me: string, @Param('userId') userId: string) {
    await this.blocks.unblock(me, userId);
    return OK;
  }

  @Delete()
  async unblockAll(@CurrentUser('id') me: string) {
    return { unblocked: await this.blocks.unblockAll(me) };
  }
}

@ApiTags('likes')
@ApiBearerAuth()
@Controller('likes')
export class LikesController {
  constructor(private readonly likes: LikesService) {}

  @Get('received')
  @ApiOperation({ summary: '"Who liked you" this week (names for VIP only)' })
  received(@CurrentUser('id') me: string) {
    return this.likes.received(me);
  }
}
