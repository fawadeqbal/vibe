import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createHmac } from 'node:crypto';
import type { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { safeEqual } from '../../common/utils/crypto';
import { AppConfig } from '../../config/app-config.service';
import { ConfirmPurchaseDto, CreatePurchaseDto } from './dto/purchase.dto';
import { PaymentsService } from './payments.service';
import { VipService } from './vip.service';
import { SkipMaintenance } from '../settings/maintenance.guard';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('purchases')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'One key per checkout attempt; retries reuse it' })
  @ApiOperation({ summary: 'Buy a coin pack or VIP plan' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreatePurchaseDto, @Headers('idempotency-key') key?: string) {
    if (!key || key.length > 100) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Idempotency-Key header is required', HttpStatus.BAD_REQUEST);
    return this.payments.create(userId, dto, key);
  }

  @Post('purchases/:id/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Complete a wallet payment with the OTP the user received' })
  confirm(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: ConfirmPurchaseDto) {
    return this.payments.confirm(userId, id, dto.otp);
  }

  @Get('purchases/:id')
  get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.payments.get(userId, id);
  }
}

@ApiTags('vip')
@ApiBearerAuth()
@Controller('vip')
export class VipController {
  constructor(private readonly vip: VipService) {}

  @Get()
  status(@CurrentUser('id') userId: string) {
    return this.vip.status(userId);
  }

  @Post('cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Stop renewal; VIP lasts until the end of the period' })
  cancel(@CurrentUser('id') userId: string) {
    return this.vip.cancel(userId);
  }
}

/**
 * Generic gateway callback: `X-Vibe-Signature: hex(hmac-sha256(secret, rawBody))`.
 * Each real gateway adapter translates its own webhook into this call.
 */
@ApiTags('webhooks')
@SkipMaintenance()
@Controller('webhooks/payments')
export class PaymentWebhookController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Post()
  @HttpCode(200)
  async handle(@Req() req: Request & { rawBody?: Buffer }, @Headers('x-vibe-signature') signature: string | undefined, @Body() body: { purchaseId: string; providerRef: string; status: 'succeeded' }) {
    const expected = createHmac('sha256', this.config.get('PAYMENT_WEBHOOK_SECRET')).update(req.rawBody ?? Buffer.from(JSON.stringify(body))).digest('hex');
    if (!signature || !safeEqual(signature, expected)) throw AppError.unauthenticated('Bad signature');
    if (body.status === 'succeeded') await this.payments.markPaid(body.purchaseId, body.providerRef);
    return { ok: true };
  }
}
