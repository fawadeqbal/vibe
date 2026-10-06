import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional } from '@nestjs/swagger';
import { AffiliatePayoutStatus, AffiliateStatus, ReferralStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

import { AffiliatesService, TermsInput } from '../../referrals/affiliates.service';
import { StatsQuery } from '../../referrals/referrals.dto';
import { ReferralsService } from '../../referrals/referrals.service';
import { AdminListQuery, QueryList } from '../core/admin-query';
import { P } from '../core/permissions';
import { Audit, CurrentStaff, RequirePermissions, StaffApi } from '../core/staff-api.decorator';

class ReferralQuery extends AdminListQuery {
  @IsOptional()
  @QueryList()
  @IsIn(Object.values(ReferralStatus), { each: true })
  status?: ReferralStatus[];

  @ApiPropertyOptional({ enum: ['user', 'affiliate'] })
  @IsOptional()
  @IsIn(['user', 'affiliate'])
  kind?: 'user' | 'affiliate';

  @IsOptional()
  @IsString()
  affiliateId?: string;
}

class AffiliateQuery extends AdminListQuery {
  @IsOptional()
  @QueryList()
  @IsIn(Object.values(AffiliateStatus), { each: true })
  status?: AffiliateStatus[];
}

class PayoutQuery extends AdminListQuery {
  @IsOptional()
  @QueryList()
  @IsIn(Object.values(AffiliatePayoutStatus), { each: true })
  status?: AffiliatePayoutStatus[];
}

class ReasonDto {
  @IsString()
  @Length(3, 200)
  reason!: string;
}

class ReferenceDto {
  /** Bank / wallet transfer reference. */
  @IsString()
  @Length(1, 200)
  reference!: string;
}

const nullableInt = () => Transform(({ value }) => (value === '' ? null : value));

class TermsDto implements TermsInput {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_]{3,20}$/, { message: 'Codes are 3–20 letters, digits or _' })
  code?: string;

  @IsOptional()
  @IsString()
  @Length(2, 40)
  displayName?: string;

  @ApiPropertyOptional({ description: 'null = the economy default' })
  @IsOptional()
  @nullableInt()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(80)
  revSharePercent?: number | null;

  @ApiPropertyOptional({ description: 'null = the economy default' })
  @IsOptional()
  @nullableInt()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(10_000)
  cpaUsdCents?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  staffNote?: string | null;
}

/** Growth: referrals, creator partners (affiliates) and their payouts. */
@StaffApi('growth')
@Controller('admin')
export class AdminGrowthController {
  constructor(
    private readonly referrals: ReferralsService,
    private readonly affiliates: AffiliatesService,
  ) {}

  // ── referrals ─────────────────────────────────────────────────────────────

  @Get('referrals')
  @RequirePermissions(P.AffiliatesView)
  @ApiOperation({ summary: 'Referrals: status (incl. rejected with the reason), code, inviter or partner, the new user and their progress' })
  listReferrals(@Query() q: ReferralQuery) {
    return this.referrals.adminList(q);
  }

  @Post('referrals/:id/approve')
  @HttpCode(200)
  @RequirePermissions(P.Referrals)
  @Audit('referral.approved', { target: 'referral' })
  @ApiOperation({ summary: 'Approve anyway: REJECTED → PENDING, checked again at once' })
  approveReferral(@Param('id') id: string) {
    return this.referrals.approve(id);
  }

  @Post('referrals/:id/reject')
  @HttpCode(200)
  @RequirePermissions(P.Referrals)
  @Audit('referral.rejected', { target: 'referral', summary: ({ body }) => String(body.reason ?? '') })
  rejectReferral(@Param('id') id: string, @Body() dto: ReasonDto) {
    return this.referrals.reject(id, dto.reason);
  }

  @Get('users/:id/referrals')
  @RequirePermissions(P.UsersView)
  @ApiOperation({ summary: 'User page: who invited them, the people they invited, their partner account' })
  userReferrals(@Param('id') id: string) {
    return this.referrals.forUser(id);
  }

  // ── partners ──────────────────────────────────────────────────────────────

  @Get('affiliates')
  @RequirePermissions(P.AffiliatesView)
  listAffiliates(@Query() q: AffiliateQuery) {
    return this.affiliates.adminList(q);
  }

  @Get('affiliates/:id')
  @RequirePermissions(P.AffiliatesView)
  @ApiOperation({ summary: 'Partner detail: profile, channels, 30-day stats, fraud flags, balance, referred users, commissions, payouts' })
  getAffiliate(@Param('id') id: string) {
    return this.affiliates.adminGet(id);
  }

  @Get('affiliates/:id/stats')
  @RequirePermissions(P.AffiliatesView)
  affiliateStats(@Param('id') id: string, @Query() q: StatsQuery) {
    return this.affiliates.adminStats(id, q.days);
  }

  @Post('affiliates/:id/approve')
  @HttpCode(200)
  @RequirePermissions(P.Affiliates)
  @Audit('affiliate.approved', { target: 'affiliate' })
  @ApiOperation({ summary: 'Approve (optionally with a different code and own terms)' })
  async approveAffiliate(@Param('id') id: string, @Body() dto: TermsDto, @CurrentStaff('id') staffId: string) {
    await this.affiliates.approve(id, staffId, dto);
    return this.affiliates.adminGet(id);
  }

  @Post('affiliates/:id/reject')
  @HttpCode(200)
  @RequirePermissions(P.Affiliates)
  @Audit('affiliate.rejected', { target: 'affiliate', summary: ({ body }) => String(body.reason ?? '') })
  async rejectAffiliate(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentStaff('id') staffId: string) {
    await this.affiliates.reject(id, staffId, dto.reason);
    return this.affiliates.adminGet(id);
  }

  @Post('affiliates/:id/suspend')
  @HttpCode(200)
  @RequirePermissions(P.Affiliates)
  @Audit('affiliate.suspended', { target: 'affiliate', summary: ({ body }) => String(body.reason ?? '') })
  @ApiOperation({ summary: 'Suspend: new commissions are held and payouts stop' })
  async suspendAffiliate(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentStaff('id') staffId: string) {
    await this.affiliates.suspend(id, staffId, dto.reason);
    return this.affiliates.adminGet(id);
  }

  @Post('affiliates/:id/reactivate')
  @HttpCode(200)
  @RequirePermissions(P.Affiliates)
  @Audit('affiliate.reactivated', { target: 'affiliate' })
  async reactivateAffiliate(@Param('id') id: string, @CurrentStaff('id') staffId: string) {
    await this.affiliates.reactivate(id, staffId);
    return this.affiliates.adminGet(id);
  }

  @Post('affiliates/:id/release-held')
  @HttpCode(200)
  @RequirePermissions(P.Affiliates)
  @Audit('affiliate.released_held', { target: 'affiliate' })
  @ApiOperation({ summary: 'Held commissions (fraud flags) go back to waiting out their hold' })
  releaseHeld(@Param('id') id: string) {
    return this.affiliates.releaseHeld(id);
  }

  @Patch('affiliates/:id')
  @RequirePermissions(P.Affiliates)
  @Audit('affiliate.updated', { target: 'affiliate' })
  @ApiOperation({ summary: 'Edit code, display name, own terms (null = default) or the staff note' })
  async updateAffiliate(@Param('id') id: string, @Body() dto: TermsDto) {
    await this.affiliates.update(id, dto);
    return this.affiliates.adminGet(id);
  }

  // ── payouts ───────────────────────────────────────────────────────────────

  @Get('affiliate-payouts')
  @RequirePermissions(P.AffiliatesView)
  listPayouts(@Query() q: PayoutQuery) {
    return this.affiliates.payoutQueue(q);
  }

  @Get('affiliate-payouts/:id/destination')
  @RequirePermissions(P.Affiliates)
  @Audit('affiliate_payout.account_viewed', { target: 'affiliate_payout' })
  @ApiOperation({ summary: 'The full account number to pay to' })
  payoutDestination(@Param('id') id: string) {
    return this.affiliates.payoutDestination(id);
  }

  @Post('affiliate-payouts/:id/paid')
  @HttpCode(200)
  @RequirePermissions(P.Affiliates)
  @Audit('affiliate_payout.paid', { target: 'affiliate_payout', summary: ({ body }) => String(body.reference ?? '') })
  markPaid(@Param('id') id: string, @Body() dto: ReferenceDto, @CurrentStaff('id') staffId: string) {
    return this.affiliates.markPayoutPaid(id, staffId, dto.reference);
  }

  @Post('affiliate-payouts/:id/reject')
  @HttpCode(200)
  @RequirePermissions(P.Affiliates)
  @Audit('affiliate_payout.rejected', { target: 'affiliate_payout', summary: ({ body }) => String(body.reason ?? '') })
  @ApiOperation({ summary: 'Reject: the money is available to the partner again' })
  rejectPayout(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentStaff('id') staffId: string) {
    return this.affiliates.rejectPayout(id, staffId, dto.reason);
  }
}
