import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { BankReferenceDto, ConfirmPurchaseDto, CreatePurchaseDto } from './dto/purchase.dto';
import { PaymentsService } from './payments.service';
import { VipService } from './vip.service';

const storeOf = (h?: string): 'play' | 'appstore' | undefined => (h === 'play' || h === 'appstore' ? h : undefined);

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('methods')
  @ApiHeader({ name: 'X-App-Store', required: false, description: '"play" or "appstore" when the app was installed from that store (limits methods to store billing, per store rules)' })
  @ApiOperation({ summary: 'Payment methods to offer, store account tokens and store SKUs' })
  methods(@CurrentUser('id') userId: string, @Headers('x-app-store') store?: string) {
    return this.payments.methods(userId, storeOf(store));
  }

  @Post('purchases')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'One key per checkout attempt; retries reuse it' })
  @ApiOperation({ summary: 'Buy a coin pack or VIP plan. The response says what to do next (`action`) if the payment needs a step.' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreatePurchaseDto, @Headers('idempotency-key') key?: string) {
    if (!key || key.length > 100) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Idempotency-Key header is required', HttpStatus.BAD_REQUEST);
    return this.payments.create(userId, dto, key);
  }

  @Get('purchases')
  @ApiOperation({ summary: 'My recent purchases' })
  list(@CurrentUser('id') userId: string) {
    return this.payments.list(userId);
  }

  @Get('purchases/:id')
  get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.payments.get(userId, id);
  }

  @Post('purchases/:id/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Complete a payment step with a code (OTP)' })
  confirm(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: ConfirmPurchaseDto) {
    return this.payments.confirm(userId, id, dto.otp);
  }

  @Post('purchases/:id/check')
  @HttpCode(200)
  @ApiOperation({ summary: '"I approved / paid": ask the provider now (also happens automatically)' })
  check(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.payments.check(userId, id);
  }

  @Post('purchases/:id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Give up on a pending payment' })
  cancel(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.payments.cancel(userId, id);
  }

  @Post('purchases/:id/bank-reference')
  @HttpCode(200)
  @ApiOperation({ summary: 'Bank transfer: tell us the reference from your bank app' })
  bankReference(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: BankReferenceDto) {
    return this.payments.bankReference(userId, id, dto.reference);
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
  @ApiOperation({ summary: 'Stop renewal; VIP lasts until the end of the period (store subscriptions are cancelled in the store)' })
  cancel(@CurrentUser('id') userId: string) {
    return this.vip.cancel(userId);
  }
}
