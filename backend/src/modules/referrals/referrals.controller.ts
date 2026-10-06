import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CursorQueryDto } from '../../common/dto/pagination.dto';
import { AffiliatesService } from './affiliates.service';
import { ApplyDto, ClaimDto, CodeQuery, PayoutRequestDto, PreviewQuery, StatsQuery } from './referrals.dto';
import { ReferralsService } from './referrals.service';

@ApiTags('referrals')
@ApiBearerAuth()
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get()
  @ApiOperation({ summary: 'Invite friends: my code and link, rewards, totals, milestones and the people I invited (latest 50)' })
  overview(@CurrentUser('id') me: string) {
    return this.referrals.overview(me);
  }

  @Public()
  @Get('preview/:code')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Landing invite page (no sign-in): who invited you (first name + photo) and the welcome coins. Counts a link visit.' })
  preview(@Param('code') code: string, @Query() q: PreviewQuery, @Req() req: Request) {
    return this.referrals.preview(code, q.s, req.ip);
  }

  @Post('claim')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: '"Have an invite code?" — once, within 48 h of sign-up' })
  claim(@CurrentUser('id') me: string, @Body() dto: ClaimDto, @Req() req: Request) {
    return this.referrals.claim(me, dto.code, req.ip);
  }
}

@ApiTags('referrals')
@ApiBearerAuth()
@Controller('affiliate')
export class AffiliateController {
  constructor(private readonly affiliates: AffiliatesService) {}

  @Get()
  @ApiOperation({ summary: 'Creator partner status, terms, link and balance' })
  overview(@CurrentUser('id') me: string) {
    return this.affiliates.overview(me);
  }

  @Get('code-available')
  @ApiOperation({ summary: 'Is this partner code free? (3–20 letters, digits or _)' })
  codeAvailable(@Query() q: CodeQuery) {
    return this.affiliates.codeAvailable(q.code);
  }

  @Post('apply')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Apply to the creator partner program (verified users, once)' })
  apply(@CurrentUser('id') me: string, @Body() dto: ApplyDto) {
    return this.affiliates.apply(me, dto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Clicks, sign-ups, active users, revenue and earnings for the last 7, 30 or 90 days' })
  stats(@CurrentUser('id') me: string, @Query() q: StatsQuery) {
    return this.affiliates.stats(me, q.days);
  }

  @Get('commissions')
  commissions(@CurrentUser('id') me: string, @Query() q: CursorQueryDto) {
    return this.affiliates.commissions(me, q);
  }

  @Get('payouts')
  payouts(@CurrentUser('id') me: string) {
    return this.affiliates.payouts(me);
  }

  @Post('payouts')
  @ApiOperation({ summary: 'Withdraw the whole available balance to a saved payout account' })
  requestPayout(@CurrentUser('id') me: string, @Body() dto: PayoutRequestDto) {
    return this.affiliates.requestPayout(me, dto.payoutAccountId);
  }
}
