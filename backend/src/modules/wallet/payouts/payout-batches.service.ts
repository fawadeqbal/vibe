import { Injectable } from '@nestjs/common';
import { CashoutStatus, PaymentMethod, PayoutBatchStatus } from '@prisma/client';

import { AppError } from '../../../common/errors/app-error';
import { Clock } from '../../../common/utils/clock';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { PaymentEvents } from '../../../integrations/core/payment-events.service';
import { CashoutService, payoutReference } from '../cashout.service';
import { PayoutAccountsService } from './payout-accounts.service';

const AWAITING_BATCH = 'awaiting_bank_batch';

/**
 * Bank cash-outs are paid by staff in batches: collect what's waiting,
 * export a CSV for the bank's bulk-transfer upload, pay it, mark it paid.
 * Cancelling a batch puts its cash-outs back in the queue.
 */
@Injectable()
export class PayoutBatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: PayoutAccountsService,
    private readonly cashouts: CashoutService,
    private readonly events: PaymentEvents,
    private readonly clock: Clock,
  ) {}

  /** Bank cash-outs waiting for a batch. */
  waiting() {
    return this.prisma.cashout.findMany({ where: { method: PaymentMethod.BANK, status: CashoutStatus.PROCESSING, providerStatus: AWAITING_BATCH, batchId: null }, orderBy: { createdAt: 'asc' } });
  }

  async create(staffId: string, max = 500) {
    const rows = (await this.waiting()).slice(0, max);
    if (!rows.length) throw AppError.conflict('No bank cash-outs are waiting');
    return this.prisma.tx(async (tx) => {
      const batch = await tx.payoutBatch.create({
        data: { method: PaymentMethod.BANK, createdById: staffId, count: rows.length, totalUsdCents: rows.reduce((a, c) => a + c.usdCents, 0), totalPkr: rows.reduce((a, c) => a + (c.amountPkr ?? 0), 0) },
      });
      const moved = await tx.cashout.updateMany({ where: { id: { in: rows.map((r) => r.id) }, batchId: null, status: CashoutStatus.PROCESSING }, data: { batchId: batch.id } });
      if (moved.count !== rows.length) throw AppError.conflict('Some cash-outs changed meanwhile; try again');
      return batch;
    });
  }

  list() {
    return this.prisma.payoutBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async get(id: string) {
    const batch = await this.prisma.payoutBatch.findUnique({ where: { id }, include: { cashouts: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } } } });
    if (!batch) throw AppError.notFound('Batch');
    return batch;
  }

  /** CSV for the bank's bulk upload. Contains full IBANs: staff with finance.cashouts only (audited). */
  async exportCsv(id: string): Promise<{ filename: string; csv: string }> {
    const batch = await this.get(id);
    if (batch.status === PayoutBatchStatus.CANCELED) throw AppError.conflict('This batch was cancelled');
    const header = ['Reference', 'Beneficiary name', 'IBAN', 'Bank', 'Amount PKR', 'Cash-out id', 'User id'];
    const lines = [header];
    for (const c of batch.cashouts) {
      const acc = c.payoutAccountId ? await this.prisma.payoutAccount.findUnique({ where: { id: c.payoutAccountId } }) : null;
      const d = acc ? this.accounts.destination(acc) : { account: '', holderName: '', bankName: '' };
      lines.push([payoutReference(c.id), d.holderName, d.account, d.bankName ?? '', String(c.amountPkr ?? ''), c.id, c.userId]);
    }
    if (batch.status === PayoutBatchStatus.OPEN) await this.prisma.payoutBatch.update({ where: { id }, data: { status: PayoutBatchStatus.EXPORTED, exportedAt: this.clock.now() } });
    return { filename: `vibe-payouts-${batch.createdAt.toISOString().slice(0, 10)}-${id.slice(-6)}.csv`, csv: lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n' };
  }

  async markPaid(id: string, reference: string) {
    const batch = await this.get(id);
    if (batch.status === PayoutBatchStatus.PAID || batch.status === PayoutBatchStatus.CANCELED) throw AppError.conflict(`Batch is already ${batch.status.toLowerCase()}`);
    for (const c of batch.cashouts) {
      if (c.status === CashoutStatus.PROCESSING) await this.cashouts.markPaid(c.id, `${reference}/${payoutReference(c.id)}`);
    }
    return this.prisma.payoutBatch.update({ where: { id }, data: { status: PayoutBatchStatus.PAID, paidAt: this.clock.now(), reference } });
  }

  async cancel(id: string) {
    const batch = await this.get(id);
    if (batch.status === PayoutBatchStatus.PAID) throw AppError.conflict('A paid batch cannot be cancelled');
    await this.prisma.tx(async (tx) => {
      await tx.cashout.updateMany({ where: { batchId: id, status: CashoutStatus.PROCESSING }, data: { batchId: null } });
      await tx.payoutBatch.update({ where: { id }, data: { status: PayoutBatchStatus.CANCELED } });
    });
    for (const c of batch.cashouts) await this.events.log({ cashoutId: c.id, provider: 'staff', type: 'payout.batch_cancelled', message: id });
    return this.get(id);
  }
}

/** RFC 4180 cell, also defusing spreadsheet formulas (=, +, -, @). */
function csvCell(v: string): string {
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
