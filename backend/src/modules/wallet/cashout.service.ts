import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { CashoutStatus, LedgerKind, PaymentMethod } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock } from '../../common/utils/clock';
import { maskAccount } from '../../common/utils/text';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { SettingsService } from '../settings/settings.service';
import { EconomyService } from '../catalog/economy.service';
import { LedgerService } from './ledger.service';
import { PayoutProvider } from './providers/payout.provider';
import { WalletService } from './wallet.service';

const ACCOUNT_KEY = (id: string) => `cashout:account:${id}`;
const PAYOUT_METHODS: PaymentMethod[] = [PaymentMethod.JAZZCASH, PaymentMethod.EASYPAISA, PaymentMethod.BANK];

/**
 * Gems → money. The gems leave the wallet when the request is made (so they
 * cannot be spent twice); a background job pays out, and a failed payout
 * puts the gems back.
 */
@Injectable()
export class CashoutService {
  private readonly logger = new Logger(CashoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly wallet: WalletService,
    private readonly redis: RedisService,
    private readonly payouts: PayoutProvider,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly economy: EconomyService,
  ) {}

  async request(userId: string, input: { gems?: number; method: PaymentMethod; account: string }) {
    if (!PAYOUT_METHODS.includes(input.method)) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Choose JazzCash, Easypaisa or bank transfer');
    const w = await this.prisma.wallet.findUniqueOrThrow({ where: { userId } });
    const gems = input.gems ?? w.gems;
    if (gems < this.economy.rules.cashoutMinGems) {
      throw new AppError(ErrorCode.CASHOUT_BELOW_MINIMUM, `Cash out from ${this.economy.rules.cashoutMinGems} gems`, 400, { minimum: this.economy.rules.cashoutMinGems, have: w.gems });
    }
    const usdCents = this.economy.gemsToUsdCents(gems);
    const review = await this.needsReview(usdCents);
    const cashout = await this.prisma.tx(async (tx) => {
      const c = await tx.cashout.create({
        data: { userId, gems, usdCents, method: input.method, accountMasked: maskAccount(input.account), status: review ? CashoutStatus.REVIEW : CashoutStatus.REQUESTED },
      });
      await this.ledger.move(userId, { gems: -gems, kind: LedgerKind.CASHOUT, title: `Cash-out to ${label(input.method)}`, usdCents, method: input.method, reference: c.id }, { tx });
      return c;
    });
    // Held cash-outs may wait for a person, so keep the account longer.
    await this.redis.client.set(ACCOUNT_KEY(cashout.id), input.account, 'EX', (review ? 30 : 7) * 86400);
    this.wallet.changed([userId]);
    if (!review) void this.process(cashout.id);
    return cashout;
  }

  /** Large cash-outs (and all of them while payouts are on hold) wait for a person. */
  private async needsReview(usdCents: number): Promise<boolean> {
    const s = await this.settings.all();
    return s['payouts.paused'] || usdCents >= Math.round(s['payouts.reviewAboveUsd'] * 100);
  }

  /** Staff approval of a held cash-out: it joins the normal payout flow. */
  async approve(id: string): Promise<void> {
    const moved = await this.prisma.cashout.updateMany({ where: { id, status: CashoutStatus.REVIEW }, data: { status: CashoutStatus.REQUESTED } });
    if (moved.count === 0) throw AppError.conflict('Only cash-outs waiting for review can be approved');
    await this.process(id);
  }

  list(userId: string) {
    return this.prisma.cashout.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  /** Pays one cash-out. Safe to call repeatedly: only REQUESTED rows are claimed. */
  async process(id: string): Promise<void> {
    const claimed = await this.prisma.cashout.updateMany({ where: { id, status: CashoutStatus.REQUESTED }, data: { status: CashoutStatus.PROCESSING } });
    if (claimed.count === 0) return;
    const cashout = await this.prisma.cashout.findUniqueOrThrow({ where: { id } });
    const account = await this.redis.client.get(ACCOUNT_KEY(id));
    if (!account) return this.reject(id, 'Payout account expired; request again');
    try {
      const r = await this.payouts.send(cashout, account);
      if (r.ok) {
        await this.prisma.cashout.update({ where: { id }, data: { status: CashoutStatus.PAID, providerRef: r.providerRef, processedAt: this.clock.now() } });
        await this.redis.client.del(ACCOUNT_KEY(id));
      } else {
        await this.reject(id, r.failureReason ?? 'Payout failed');
      }
    } catch (e) {
      // Leave it PROCESSING for a human; never auto-refund an unknown outcome.
      this.logger.error({ err: e, id }, 'Payout outcome unknown');
    }
  }

  /** Marks a cash-out rejected and returns the gems. */
  async reject(id: string, reason: string): Promise<void> {
    const userId = await this.prisma.tx(async (tx) => {
      const c = await tx.cashout.findUniqueOrThrow({ where: { id } });
      if (c.status === CashoutStatus.PAID || c.status === CashoutStatus.REJECTED) return null;
      await tx.cashout.update({ where: { id }, data: { status: CashoutStatus.REJECTED, failureReason: reason, processedAt: this.clock.now() } });
      await this.ledger.move(c.userId, { gems: c.gems, kind: LedgerKind.CASHOUT_REVERSAL, title: 'Cash-out returned', reference: id, idempotencyKey: `cashout-reversal:${id}` }, { tx });
      return c.userId;
    });
    if (userId) this.wallet.changed([userId]);
  }

  /** Manual payout (e.g. sent by bank transfer, or an unknown outcome confirmed). */
  async markPaid(id: string, providerRef: string): Promise<void> {
    const done = await this.prisma.cashout.updateMany({
      where: { id, status: { in: [CashoutStatus.REVIEW, CashoutStatus.REQUESTED, CashoutStatus.PROCESSING] } },
      data: { status: CashoutStatus.PAID, providerRef, processedAt: this.clock.now() },
    });
    if (done.count === 0) throw AppError.conflict('This cash-out is already finished');
    await this.redis.client.del(ACCOUNT_KEY(id));
  }

  /** Retry anything still REQUESTED (e.g. the instance died before processing). */
  @Interval(60_000)
  async sweep(): Promise<void> {
    await this.redis.withLock('cashout-sweep', 55_000, async () => {
      const pending = await this.prisma.cashout.findMany({ where: { status: CashoutStatus.REQUESTED }, take: 50, select: { id: true } });
      for (const c of pending) await this.process(c.id);
    });
  }
}

const label = (m: PaymentMethod): string => ({ JAZZCASH: 'JazzCash', EASYPAISA: 'Easypaisa', BANK: 'bank', GOOGLE_PLAY: 'Google Play', APP_STORE: 'App Store', CARD: 'card' })[m];
