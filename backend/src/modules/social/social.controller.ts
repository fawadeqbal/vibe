import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OK } from '../../common/dto/ok.dto';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { CursorQueryDto } from '../../common/dto/pagination.dto';
import { BlocksService } from './blocks.service';
import { ReactDto, SendGiftDto, SendMediaDto, SendMessageDto } from './dto/social.dto';
import { FriendsService } from './friends.service';
import { LikesService } from './likes.service';
import { MessagesService } from './messages.service';
import { StreakService } from './streak.service';

/** Chat photos up to 8 MB; voice notes up to 3 MB. */
const MAX_CHAT_FILE = 8 * 1024 * 1024;
const MAX_VOICE = 3 * 1024 * 1024;

@ApiTags('friends')
@ApiBearerAuth()
@Controller('friends')
export class FriendsController {
  constructor(
    private readonly friends: FriendsService,
    private readonly messages: MessagesService,
    private readonly streaks: StreakService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Friends and pending requests (incoming + sent), most recent chat first' })
  list(@CurrentUser('id') me: string) {
    return this.friends.list(me);
  }

  @Post(':userId/request')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accepts their friend request if they asked first. New requests are only sent from a live call (match:friend); otherwise 403 FRIEND_IN_CALL_ONLY' })
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
    return this.messages.send(me, userId, dto.text, dto.replyToId);
  }

  @Post(':userId/messages/media')
  @ApiOperation({ summary: 'Send a photo (JPEG/PNG/WebP, 8 MB) or a voice note (webm/ogg/m4a/aac/mp3, 3 MB): multipart `file` + `kind`, `seconds`, `w`/`h`, `replyToId`' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_CHAT_FILE, files: 1 } }))
  sendMedia(@CurrentUser('id') me: string, @Param('userId') userId: string, @Body() dto: SendMediaDto, @UploadedFile() file?: Express.Multer.File) {
    if (file && dto.kind === 'voice' && file.size > MAX_VOICE) throw new AppError(ErrorCode.VALIDATION_FAILED, 'That voice note is too big');
    return this.messages.sendMedia(me, userId, dto.kind, file, { seconds: dto.seconds, w: dto.w, h: dto.h, replyToId: dto.replyToId });
  }

  @Put(':userId/messages/:messageId/reaction')
  @ApiOperation({ summary: 'React with one emoji (same again or empty removes it). Both get `message:updated`.' })
  react(@CurrentUser('id') me: string, @Param('userId') userId: string, @Param('messageId') messageId: string, @Body() dto: ReactDto) {
    return this.messages.react(me, userId, messageId, dto.emoji ?? null);
  }

  @Delete(':userId/messages/:messageId')
  @ApiOperation({ summary: 'Unsend your own message (within chatUnsendMinutes). Both get `message:updated` with unsent: true.' })
  unsend(@CurrentUser('id') me: string, @Param('userId') userId: string, @Param('messageId') messageId: string) {
    return this.messages.unsend(me, userId, messageId);
  }

  @Post(':userId/typing')
  @HttpCode(204)
  @ApiOperation({ summary: 'You are typing: your friend gets `chat:typing` (send at most every few seconds)' })
  async typing(@CurrentUser('id') me: string, @Param('userId') userId: string): Promise<void> {
    await this.messages.typing(me, userId);
  }

  @Post(':userId/gifts')
  gift(@CurrentUser('id') me: string, @Param('userId') userId: string, @Body() dto: SendGiftDto, @Headers('idempotency-key') key?: string) {
    return this.messages.sendGift(me, userId, dto.giftId, key);
  }

  @Post(':userId/streak/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restore a 3+ day streak that broke yesterday: streakRestoreCost coins (VIP free); 409 STREAK_NOT_RESTORABLE otherwise' })
  restoreStreak(@CurrentUser('id') me: string, @Param('userId') userId: string) {
    return this.streaks.restore(me, userId);
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
