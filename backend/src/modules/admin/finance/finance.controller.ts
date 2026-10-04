import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional } from '@nestjs/swagger';
import { CashoutStatus, LedgerKind, PaymentMethod, ProductType, SubscriptionStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

import { OK } from '../../../common/dto/ok.dto';
import { PaymentsService } from '../../payments/payments.service';
import { CashoutService } from '../../wallet/cashout.service';
import { AdminListQuery, QueryList } from '../core/admin-query';
import { P } from '../core/permissions';
import { Audit, RequirePermissions, StaffApi } from '../core/staff-api.decorator';
import { FinanceService } from './finance.service';

class FinanceQuery extends AdminListQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;
}

class PurchaseQuery extends FinanceQuery {
  @IsOptional()
  @QueryList()
  @IsIn(['PENDING', 'REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'REFUNDED'], { each: true })
  status?: ('PENDING' | 'REQUIRES_ACTION' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED')[];

  @IsOptional()
  @QueryList()
  @IsIn(Object.values(PaymentMethod), { each: true })
  method?: PaymentMethod[];

  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;
}

class CashoutQuery extends FinanceQuery {
  @IsOptional()
  @QueryList()
  @IsIn(Object.values(CashoutStatus), { each: true })
  status?: CashoutStatus[];

  @IsOptional()
  @QueryList()
  @IsIn(Object.values(PaymentMethod), { each: true })
  method?: PaymentMethod[];
}

class LedgerQuery extends FinanceQuery {
  @IsOptional()
  @QueryList()
  @IsIn(Object.values(LedgerKind), { each: true })
  kind?: LedgerKind[];
}

class SubscriptionQuery extends FinanceQuery {
  @IsOptional()
  @QueryList()
  @IsIn(Object.values(SubscriptionStatus), { each: true })
  status?: SubscriptionStatus[];

  @IsOptional()
  @IsString()
  planId?: string;
}

class SummaryQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days: number = 30;
}

class RefDto {
  /** Bank / provider reference. */
  @IsString()
  @Length(1, 200)
  ref!: string;
}

class ReasonDto {
  @IsString()
  @Length(3, 200)
  reason!: string;
}

@StaffApi('finance')
@Controller('admin')
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly payments: PaymentsService,
    private readonly cashoutService: CashoutService,
  ) {}

  @Get('finance/summary')
  @RequirePermissions(P.FinanceView)
  summary(@Query() q: SummaryQuery) {
    return this.finance.summary(q.days);
  }

  // ── purchases ─────────────────────────────────────────────────────────────

  @Get('purchases')
  @RequirePermissions(P.FinanceView)
  purchases(@Query() q: PurchaseQuery) {
    return this.finance.purchases(q);
  }

  @Get('purchases/:id')
  @RequirePermissions(P.FinanceView)
  purchase(@Param('id') id: string) {
    return this.finance.purchase(id);
  }

  @Post('purchases/:id/mark-paid')
  @HttpCode(200)
  @RequirePermissions(P.FinancePurchases)
  @Audit('purchase.marked_paid', { target: 'purchase', summary: ({ body }) => `ref ${String(body.ref)}` })
  @ApiOperation({ summary: 'A pending charge was paid (e.g. bank transfer arrived): fulfil it' })
  markPaid(@Param('id') id: string, @Body() dto: RefDto) {
    return this.payments.markPaid(id, dto.ref);
  }

  @Post('purchases/:id/refund')
  @HttpCode(200)
  @RequirePermissions(P.FinanceRefunds)
  @Audit('purchase.refunded', { target: 'purchase', summary: ({ body }) => String(body.reason) })
  @ApiOperation({ summary: 'Undo what a purchase gave (coins/VIP). Refund the money in the provider.' })
  refund(@Param('id') id: string, @Body() dto: ReasonDto) {
    return this.payments.refund(id, dto.reason);
  }

  // ── cash-outs ─────────────────────────────────────────────────────────────

  @Get('cashouts')
  @RequirePermissions(P.FinanceView)
  cashouts(@Query() q: CashoutQuery) {
    return this.finance.cashouts(q);
  }

  @Post('cashouts/:id/approve')
  @HttpCode(200)
  @RequirePermissions(P.FinanceCashouts)
  @Audit('cashout.approved', { target: 'cashout' })
  async approve(@Param('id') id: string) {
    await this.cashoutService.approve(id);
    return OK;
  }

  @Post('cashouts/:id/paid')
  @HttpCode(200)
  @RequirePermissions(P.FinanceCashouts)
  @Audit('cashout.marked_paid', { target: 'cashout', summary: ({ body }) => `ref ${String(body.ref)}` })
  async paid(@Param('id') id: string, @Body() dto: RefDto) {
    await this.cashoutService.markPaid(id, dto.ref);
    return OK;
  }

  @Post('cashouts/:id/reject')
  @HttpCode(200)
  @RequirePermissions(P.FinanceCashouts)
  @Audit('cashout.rejected', { target: 'cashout', summary: ({ body }) => String(body.reason) })
  @ApiOperation({ summary: 'Reject and return the gems to the user' })
  async reject(@Param('id') id: string, @Body() dto: ReasonDto) {
    await this.cashoutService.reject(id, dto.reason);
    return OK;
  }

  // ── ledger & subscriptions ────────────────────────────────────────────────

  @Get('ledger')
  @RequirePermissions(P.WalletView)
  ledger(@Query() q: LedgerQuery) {
    return this.finance.ledger(q);
  }

  @Get('subscriptions')
  @RequirePermissions(P.FinanceView)
  subscriptions(@Query() q: SubscriptionQuery) {
    return this.finance.subscriptions(q);
  }
}
