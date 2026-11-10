import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CursorQueryDto } from '../../common/dto/pagination.dto';
import { ActivityFeedService } from './activity-feed.service';

class MarkReadDto {
  @ApiPropertyOptional({ description: 'Lines to mark read; leave out to mark everything read' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids?: string[];
}

/** The Notifications page (separate from chats and from Messages from Vibe). */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('activity')
export class ActivityController {
  constructor(private readonly feed: ActivityFeedService) {}

  @Get()
  @ApiOperation({ summary: 'Your notifications, newest first, with who each is from and where you stand with them; plus the unread count' })
  list(@CurrentUser('id') me: string, @Query() q: CursorQueryDto) {
    return this.feed.list(me, q);
  }

  @Get('unread')
  @ApiOperation({ summary: 'How many notifications you have not seen (the bell badge)' })
  async unread(@CurrentUser('id') me: string) {
    return { unread: await this.feed.unread(me) };
  }

  @Post('seen')
  @HttpCode(200)
  @ApiOperation({ summary: 'Opened the Notifications page: the bell badge goes to 0 (lines stay unread until opened)' })
  seen(@CurrentUser('id') me: string) {
    return this.feed.markSeen(me);
  }

  @Post('read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark some (ids) or all notifications as read' })
  read(@CurrentUser('id') me: string, @Body() dto: MarkReadDto) {
    return this.feed.markRead(me, dto.ids);
  }
}
