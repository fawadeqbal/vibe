import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DiscoverReturnService } from './discover-return.service';
import { DiscoverService } from './discover.service';
import { DeckQueryDto, NotifyNewDto, SwipeDto, VisibilityDto } from './dto/discover.dto';

@ApiTags('discover')
@ApiBearerAuth()
@Controller('discover')
export class DiscoverController {
  constructor(
    private readonly discover: DiscoverService,
    private readonly back: DiscoverReturnService,
  ) {}

  @Get('welcome')
  @ApiOperation({ summary: 'What happened since your last Discover visit (show after 2+ days away). Also records this visit.' })
  welcome(@CurrentUser('id') me: string) {
    return this.back.welcome(me);
  }

  @Get('notify-new')
  @ApiOperation({ summary: 'Whether you asked to hear when new people join' })
  async notifyNew(@CurrentUser('id') me: string) {
    return { on: await this.back.notifyOn(me) };
  }

  @Put('notify-new')
  @ApiOperation({ summary: '"Tell me when new people join" — discover:new-people (push when away), at most once a day' })
  async setNotifyNew(@CurrentUser('id') me: string, @Body() dto: NotifyNewDto) {
    return { on: await this.back.setNotify(me, dto.on) };
  }

  @Get('status')
  @ApiOperation({
    summary: 'Likes left today, Super Like and Undo prices, whether you appear in decks, and "liked you" counts',
  })
  status(@CurrentUser('id') me: string) {
    return this.discover.status(me);
  }

  @Get('deck')
  @ApiOperation({
    summary:
      'The next people to swipe: real, active people with a photo you are not connected with. Super Likes come first. Gender/country/online/verified filters need VIP, Vibe Hour or a filter pass (FILTERS_LOCKED, 402).',
  })
  deck(@CurrentUser('id') me: string, @Query() q: DeckQueryDto) {
    return this.discover.deck(me, q);
  }

  @Post('swipes')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Like, Super Like or pass. Two likes make a match: friends, chat open, `discover:match` to both. OUT_OF_LIKES (429) when the free likes are used.',
  })
  swipe(@CurrentUser('id') me: string, @Body() dto: SwipeDto) {
    return this.discover.swipe(me, dto.userId, dto.kind);
  }

  @Post('undo')
  @HttpCode(200)
  @ApiOperation({ summary: 'Bring back the last person you passed (within an hour). Coins, free for VIP.' })
  undo(@CurrentUser('id') me: string) {
    return this.discover.undo(me);
  }

  @Post('likes/buy')
  @HttpCode(200)
  @ApiOperation({ summary: 'More likes for today, for coins' })
  buyLikes(@CurrentUser('id') me: string) {
    return this.discover.buyLikes(me);
  }

  @Post('filter-pass')
  @HttpCode(200)
  @ApiOperation({ summary: 'Unlock gender, country, online and verified filters for a while, for coins (free for VIP and in Vibe Hour)' })
  buyFilterPass(@CurrentUser('id') me: string) {
    return this.discover.buyFilterPass(me);
  }

  @Get('liked-you')
  @ApiOperation({
    summary:
      'People who liked you and are waiting for an answer. VIP sees who; others see the count and blurred previews.',
  })
  likedYou(@CurrentUser('id') me: string) {
    return this.discover.likedYou(me);
  }

  @Post('liked-you/seen')
  @HttpCode(200)
  @ApiOperation({ summary: 'Clear the "liked you" badge' })
  async seen(@CurrentUser('id') me: string) {
    await this.discover.markLikesSeen(me);
    return { unseen: 0 };
  }

  @Put('visibility')
  @ApiOperation({ summary: 'Show me in Discover (on by default)' })
  visibility(@CurrentUser('id') me: string, @Body() dto: VisibilityDto) {
    return this.discover.setVisible(me, dto.visible);
  }
}
