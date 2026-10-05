import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { redact } from './redact';

export interface PaymentEventInput {
  purchaseId?: string;
  cashoutId?: string;
  provider: string;
  /** e.g. charge.started, charge.pending, status.checked, charge.succeeded, webhook, refund, payout.sent */
  type: string;
  code?: string | number | null;
  message?: string | null;
  data?: unknown;
}

/** The trail staff see on a purchase or cash-out: every step with every provider. Redacted; never throws. */
@Injectable()
export class PaymentEvents {
  private readonly logger = new Logger(PaymentEvents.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(e: PaymentEventInput, tx?: Prisma.TransactionClient): Promise<void> {
    try {
      await (tx ?? this.prisma).paymentEvent.create({
        data: {
          purchaseId: e.purchaseId,
          cashoutId: e.cashoutId,
          provider: e.provider,
          type: e.type,
          code: e.code === undefined || e.code === null ? null : String(e.code).slice(0, 60),
          message: e.message?.slice(0, 500) ?? null,
          data: e.data === undefined ? undefined : (redact(e.data) as Prisma.InputJsonValue),
        },
      });
    } catch (err) {
      this.logger.warn({ err, type: e.type }, 'Could not record payment event');
    }
  }

  list(where: { purchaseId?: string; cashoutId?: string }) {
    return this.prisma.paymentEvent.findMany({ where, orderBy: { createdAt: 'asc' }, take: 200 });
  }
}
