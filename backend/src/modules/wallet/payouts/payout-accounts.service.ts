import { Injectable } from '@nestjs/common';
import { PaymentMethod, PayoutAccount } from '@prisma/client';

import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { Clock } from '../../../common/utils/clock';
import { SecretBox } from '../../../common/utils/secret-box';
import { AppConfig } from '../../../config/app-config.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { maskDestination, normaliseAccount } from './account-rules';
import { PAYOUT_METHODS, PayoutDestination } from './payout-adapter';

export interface NewPayoutAccount {
  method: PaymentMethod;
  account: string;
  holderName: string;
  bankName?: string;
  cnic?: string;
  makeDefault?: boolean;
}

const MAX_ACCOUNTS = 5;

/**
 * Where a person's cash-outs go. The full number/IBAN is sealed with
 * AES-GCM (DATA_ENCRYPTION_KEY); only the masked form is ever returned.
 */
@Injectable()
export class PayoutAccountsService {
  private readonly box: SecretBox;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    config: AppConfig,
  ) {
    this.box = new SecretBox(config.dataKey('payouts'));
  }

  async list(userId: string) {
    const rows = await this.prisma.payoutAccount.findMany({ where: { userId, deletedAt: null }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
    return rows.map((a) => this.view(a));
  }

  view(a: PayoutAccount) {
    return { id: a.id, method: a.method, accountMasked: a.accountMasked, holderName: a.holderName, bankName: a.bankName, isDefault: a.isDefault, createdAt: a.createdAt.toISOString() };
  }

  async add(userId: string, input: NewPayoutAccount): Promise<PayoutAccount> {
    if (!PAYOUT_METHODS.includes(input.method)) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Choose JazzCash, Easypaisa or a bank account');
    const n = normaliseAccount(input.method, input.account);
    if (!n.ok) throw new AppError(ErrorCode.VALIDATION_FAILED, n.message);
    if (input.method === PaymentMethod.BANK && !input.bankName) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Enter the bank name');
    const existing = await this.prisma.payoutAccount.findMany({ where: { userId, deletedAt: null } });
    const masked = maskDestination(input.method, n.value);
    // Same destination again: reuse it (update the name).
    for (const e of existing) {
      if (e.method === input.method && this.destination(e).account === n.value) {
        return this.prisma.payoutAccount.update({ where: { id: e.id }, data: { holderName: input.holderName.trim(), bankName: input.bankName?.trim() || e.bankName } });
      }
    }
    if (existing.length >= MAX_ACCOUNTS) throw AppError.conflict(`You can save up to ${MAX_ACCOUNTS} payout accounts. Remove one first.`);
    const makeDefault = input.makeDefault || existing.length === 0;
    return this.prisma.tx(async (tx) => {
      if (makeDefault) await tx.payoutAccount.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      const details: PayoutDestination = { account: n.value, holderName: input.holderName.trim(), bankName: input.bankName?.trim(), cnic: input.cnic };
      return tx.payoutAccount.create({
        data: { userId, method: input.method, details: this.box.seal(JSON.stringify(details)), accountMasked: masked, holderName: details.holderName, bankName: details.bankName, isDefault: makeDefault },
      });
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const a = await this.owned(userId, id);
    await this.prisma.payoutAccount.update({ where: { id: a.id }, data: { deletedAt: this.clock.now(), isDefault: false } });
  }

  async makeDefault(userId: string, id: string) {
    const a = await this.owned(userId, id);
    await this.prisma.tx(async (tx) => {
      await tx.payoutAccount.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      await tx.payoutAccount.update({ where: { id: a.id }, data: { isDefault: true } });
    });
    return this.list(userId);
  }

  async owned(userId: string, id: string): Promise<PayoutAccount> {
    const a = await this.prisma.payoutAccount.findFirst({ where: { id, userId, deletedAt: null } });
    if (!a) throw AppError.notFound('Payout account');
    return a;
  }

  /** The full destination — only for sending money or staff exports. */
  destination(a: PayoutAccount): PayoutDestination {
    return JSON.parse(this.box.open(a.details)) as PayoutDestination;
  }
}
