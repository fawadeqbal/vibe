import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Idempotent } from '../../common/decorators/idempotent.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CursorQueryDto } from '../../common/dto/pagination.dto';
import { CashoutService } from './cashout.service';
import { AdRewardDto, CashoutDto, PayoutAccountDto } from './dto/wallet.dto';
import { PayoutAccountsService } from './payouts/payout-accounts.service';
import { PayoutGateway } from './payouts/payout-gateway.service';
import { AdsService } from './ads/ads.service';
import { RewardsService } from './rewards.service';
import { WalletService } from './wallet.service';
import { SkipMaintenance } from '../settings/maintenance.guard';

@ApiTags('wallet')
@ApiBearerAuth()
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly rewards: RewardsService,
    private readonly cashouts: CashoutService,
    private readonly payoutAccounts: PayoutAccountsService,
    private readonly payoutGateway: PayoutGateway,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Balances, VIP/boost state, streak and daily allowances' })
  get(@CurrentUser('id') userId: string) {
    return this.wallet.view(userId);
  }

  @Get('transactions')
  transactions(@CurrentUser('id') userId: string, @Query() q: CursorQueryDto) {
    return this.wallet.transactions(userId, q);
  }

  @Post('check-in')
  @HttpCode(200)
  @Idempotent()
  async checkIn(@CurrentUser('id') userId: string) {
    const r = await this.rewards.checkIn(userId);
    return { ...r, wallet: await this.wallet.view(userId) };
  }

  @Post('rewards/ad')
  @HttpCode(200)
  @Idempotent()
  async ad(@CurrentUser('id') userId: string, @Body() dto: AdRewardDto) {
    const r = await this.rewards.rewardAd(userId, dto.adToken);
    return { ...r, wallet: await this.wallet.view(userId) };
  }

  @Post('rewards/profile')
  @HttpCode(200)
  @Idempotent()
  async profile(@CurrentUser('id') userId: string) {
    const r = await this.rewards.claimProfileBonus(userId);
    return { ...r, wallet: await this.wallet.view(userId) };
  }

  @Post('boost')
  @HttpCode(200)
  @Idempotent()
  async boost(@CurrentUser('id') userId: string) {
    const r = await this.rewards.boost(userId);
    return { ...r, wallet: await this.wallet.view(userId) };
  }

  @Post('cashouts')
  @Idempotent({ required: true })
  async cashout(@CurrentUser('id') userId: string, @Body() dto: CashoutDto) {
    const c = await this.cashouts.request(userId, dto);
    return { cashout: this.cashouts.view(c), wallet: await this.wallet.view(userId) };
  }

  @Get('cashouts')
  listCashouts(@CurrentUser('id') userId: string) {
    return this.cashouts.list(userId);
  }

  @Get('payout-accounts')
  @ApiOperation({ summary: 'Saved cash-out destinations (masked) and which rails are available' })
  async payoutAccountsList(@CurrentUser('id') userId: string) {
    return { accounts: await this.payoutAccounts.list(userId), methods: this.payoutGateway.available() };
  }

  @Post('payout-accounts')
  @ApiOperation({ summary: 'Save a JazzCash / Easypaisa number or bank IBAN for cash-outs' })
  async addPayoutAccount(@CurrentUser('id') userId: string, @Body() dto: PayoutAccountDto) {
    return this.payoutAccounts.view(await this.payoutAccounts.add(userId, dto));
  }

  @Post('payout-accounts/:id/default')
  @HttpCode(200)
  makeDefaultPayoutAccount(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.payoutAccounts.makeDefault(userId, id);
  }

  @Delete('payout-accounts/:id')
  async removePayoutAccount(@CurrentUser('id') userId: string, @Param('id') id: string) {
    await this.payoutAccounts.remove(userId, id);
    return { ok: true };
  }
}

/** AdMob server-side verification callback (configure its URL in AdMob). */
@ApiTags('webhooks')
@SkipMaintenance()
@Controller('webhooks/admob')
export class AdMobWebhookController {
  constructor(private readonly ads: AdsService) {}

  @Public()
  @Get('ssv')
  async ssv(@Req() req: Request) {
    const raw = req.originalUrl.split('?')[1] ?? '';
    const ok = await this.ads.acceptCallback(raw);
    return { ok };
  }
}
