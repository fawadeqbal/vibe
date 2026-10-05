import { Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OK } from '../../common/dto/ok.dto';
import { CursorQueryDto } from '../../common/dto/pagination.dto';
import { FollowsService } from './follows.service';

@ApiTags('follows')
@ApiBearerAuth()
@Controller('follows')
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Post(':userId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Follow someone you have met in a match (a request if their account is private)' })
  follow(@CurrentUser('id') me: string, @Param('userId') userId: string) {
    return this.follows.follow(me, userId);
  }

  @Delete(':userId')
  @ApiOperation({ summary: 'Unfollow, or take back a follow request' })
  async unfollow(@CurrentUser('id') me: string, @Param('userId') userId: string) {
    await this.follows.unfollow(me, userId);
    return OK;
  }
}

@ApiTags('follows')
@ApiBearerAuth()
@Controller('me')
export class MyFollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Get('followers')
  @ApiOperation({ summary: 'People who follow you, newest first' })
  followers(@CurrentUser('id') me: string, @Query() q: CursorQueryDto) {
    return this.follows.list(me, 'followers', q);
  }

  @Get('following')
  @ApiOperation({ summary: 'People you follow, newest first' })
  following(@CurrentUser('id') me: string, @Query() q: CursorQueryDto) {
    return this.follows.list(me, 'following', q);
  }

  @Get('follow-requests')
  @ApiOperation({ summary: 'People waiting to follow your private account' })
  requests(@CurrentUser('id') me: string, @Query() q: CursorQueryDto) {
    return this.follows.list(me, 'requests', q);
  }

  @Post('follow-requests/:userId/accept')
  @HttpCode(200)
  async accept(@CurrentUser('id') me: string, @Param('userId') userId: string) {
    await this.follows.accept(me, userId);
    return OK;
  }

  @Post('follow-requests/:userId/decline')
  @HttpCode(200)
  async decline(@CurrentUser('id') me: string, @Param('userId') userId: string) {
    await this.follows.decline(me, userId);
    return OK;
  }

  @Delete('followers/:userId')
  @ApiOperation({ summary: 'Remove someone from your followers (without blocking)' })
  async remove(@CurrentUser('id') me: string, @Param('userId') userId: string) {
    await this.follows.removeFollower(me, userId);
    return OK;
  }
}
