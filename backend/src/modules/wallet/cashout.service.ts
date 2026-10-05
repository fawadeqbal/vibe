import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Cashout, CashoutStatus, LedgerKind, PaymentMethod, PayoutAccount } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock, MS } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { RedisService } from '../../infra/redis/redis.service';
import { PaymentEvents } from '../../integrations/core/payment-events.service';
import { EconomyService } from '../catalog/economy.service';
import { SettingsService } from '../settings/settings.service';
import { LedgerService } from './ledger.service';
import { PayoutAccountsService } from './payouts/payout-accounts.service';
import { PayoutDestination, PayoutInput, PayoutStep } from './payouts/payout-adapter';
import { PayoutGateway } from './payouts/payout-gateway.service';
import { WalletService } from './wallet.service';

/** Cash-outs made before saved payout accounts kept the account here for a few days. */
const LEGACY_ACCOUNT_KEY = (id: string) => `cashout:account:${id}`;
const AWAITING_BATCH = 'awaiting_bank_batch';

export interface CashoutRequest {
  gems?: number;
  /** A saved payout account… */
  payoutAccountId?: string;
  /** …or a new destination (saved for next time). */
  method?: PaymentMethod;
  account?: string;
  holderName?: string;
  bankName?: string;
}

/** Stable, ≤ 20-character reference providers use to refuse duplicate payouts. */
export const payoutReference = (cashoutId: string) => `V${cashoutId.slice(-19)}`;

/**
 * Gems → money. The gems leave the wallet when the request is made (so they
 * cannot be spent twice); payouts go through the method's adapter. A
 * definite failure puts the gems back; an unclear outcome is never
 * refunded automatically — it is checked again, or left for staff.
 */
@Injectable()
export class CashoutService {
  private readonly logger = new Logger(CashoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly wallet: WalletService,
    private readonly redis: RedisService,
    private readonly payouts: PayoutGateway,
    private readonly accounts: PayoutAccountsService,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly economy: EconomyService,
    private readonly events: PaymentEvents,
    private readonly realtime: RealtimeService,
  ) {}

  async request(userId: string, input: CashoutRequest) {
    const account = await this.resolveAccount(userId, input);
    this.payouts.adapter(account.method); // fails early if that rail is off
    const w = await this.prisma.wallet.findUniqueOrThrow({ where: { userId } });
    const gems = input.gems ?? w.gems;
    if (gems < this.economy.rules.cashoutMinGems) {
      throw new AppError(ErrorCode.CASHOUT_BELOW_MINIMUM, `Cash out from ${this.economy.rules.cashoutMinGems} gems`, 400, { minimum: this.economy.rules.cashoutMinGems, have: w.gems });
    }
    const usdCents = this.economy.gemsToUsdCents(gems);
    await this.checkKyc(userId, usdCents);
    const amountPkr = Math.floor((usdCents / 100) * (await this.settings.get('payments.usdToPkr')));
    const review = await this.needsReview(usdCents);
    const cashout = await this.prisma.tx(async (tx) => {
      const c = await tx.cashout.create({
        data: { userId, gems, usdCents, amountPkr, method: account.method, payoutAccountId: account.id, accountMasked: account.accountMasked, status: review ? CashoutStatus.REVIEW : CashoutStatus.REQUESTED },
      });
      await this.ledger.move(userId, { gems: -gems, kind: LedgerKind.CASHOUT, title: `Cash-out to ${label(account.method)}`, usdCents, method: account.method, reference: c.id }, { tx });
      return c;
    });
    await this.events.log({ cashoutId: cashout.id, provider: 'vibe', type: review ? 'payout.held_for_review' : 'payout.requested', message: `PKR ${amountPkr}` });
    this.wallet.changed([userId]);
    if (!review) void this.process(cashout.id);
    return cashout;
  }

  private async resolveAccount(userId: string, input: CashoutRequest): Promise<PayoutAccount> {
    if (input.payoutAccountId) return this.accounts.owned(userId, input.payoutAccountId);
    if (!input.method || !input.account) {
      const def = await this.prisma.payoutAccount.findFirst({ where: { userId, deletedAt: null, isDefault: true } });
      if (def) return def;
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Choose where to send the money');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
    return this.accounts.add(userId, { method: input.method, account: input.account, holderName: input.holderName || user.name || 'Account holder', bankName: input.bankName });
  }

  /** Above the monthly limit people must be verified (selfie) before cashing out. */
  private async checkKyc(userId: string, usdCents: number): Promise<void> {
    const limit = Math.round((await this.settings.get('payouts.kycAboveUsdPerMonth')) * 100);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { verified: true } });
    if (user.verified) return;
    const since = new Date(this.clock.now().getTime() - 30 * MS.day);
    const recent = await this.prisma.cashout.aggregate({ where: { userId, createdAt: { gte: since }, status: { not: CashoutStatus.REJECTED } }, _sum: { usdCents: true } });
    if ((recent._sum.usdCents ?? 0) + usdCents > limit) {
      throw new AppError(ErrorCode.KYC_REQUIRED, `Verify your profile (selfie) to cash out more than $${limit / 100} a month.`, HttpStatus.FORBIDDEN, { limitUsd: limit / 100 });
    }
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
    await this.events.log({ cashoutId: id, provider: 'staff', type: 'payout.approved' });
    await this.process(id);
  }

  async list(userId: string) {
    const rows = await this.prisma.cashout.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map((c) => this.view(c));
  }

  /** What the app sees of a cash-out (no internal provider/batch fields). */
  view(c: Cashout) {
    return {
      id: c.id,
      gems: c.gems,
      usdCents: c.usdCents,
      amountPkr: c.amountPkr,
      method: c.method,
      accountMasked: c.accountMasked,
      payoutAccountId: c.payoutAccountId,
      status: c.status,
      failureReason: c.failureReason,
      createdAt: c.createdAt.toISOString(),
      processedAt: c.processedAt?.toISOString() ?? null,
    };
  }

  private async destination(c: Cashout): Promise<PayoutDestination | null> {
    if (c.payoutAccountId) {
      const a = await this.prisma.payoutAccount.findUnique({ where: { id: c.payoutAccountId } });
      return a ? this.accounts.destination(a) : null;
    }
    const legacy = await this.redis.client.get(LEGACY_ACCOUNT_KEY(c.id));
    return legacy ? { account: legacy, holderName: '' } : null;
  }

  private async input(c: Cashout): Promise<PayoutInput | null> {
    const destination = await this.destination(c);
    if (!destination) return null;
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: c.userId }, select: { id: true, email: true, name: true } });
    const pkr = c.amountPkr ?? Math.floor((c.usdCents / 100) * (await this.settings.get('payments.usdToPkr')));
    return { cashoutId: c.id, reference: payoutReference(c.id), amountMinor: pkr * 100, destination, user, providerRef: c.providerRef };
  }

  /** Pays one cash-out. Safe to call repeatedly: only REQUESTED rows are claimed. */
  async process(id: string): Promise<void> {
    const claimed = await this.prisma.cashout.updateMany({ where: { id, status: CashoutStatus.REQUESTED }, data: { status: CashoutStatus.PROCESSING, attempts: { increment: 1 } } });
    if (claimed.count === 0) return;
    const cashout = await this.prisma.cashout.findUniqueOrThrow({ where: { id } });
    const input = await this.input(cashout);
    if (!input) return this.reject(id, 'Payout account is missing; add it again and request a new cash-out');
    const adapter = this.payouts.adapter(cashout.method);
    let step: PayoutStep;
    try {
      step = await adapter.send(input);
    } catch (e) {
      // Leave it PROCESSING; never auto-refund an unknown outcome.
      this.logger.error({ err: e, id }, 'Payout outcome unknown');
      await this.prisma.cashout.update({ where: { id }, data: { providerStatus: `error: ${(e as Error).message}`.slice(0, 120), lastCheckedAt: this.clock.now() } });
      await this.events.log({ cashoutId: id, provider: adapter.provider, type: 'payout.error', message: (e as Error).message });
      return;
    }
    await this.events.log({ cashoutId: id, provider: adapter.provider, type: `payout.${step.status}`, code: 'code' in step ? step.code : undefined, message: step.status === 'failed' ? step.reason : step.status === 'manual' ? step.note : undefined, data: 'raw' in step ? step.raw : undefined });
    await this.applyStep(cashout, step);
  }

  private async applyStep(c: Cashout, step: PayoutStep): Promise<void> {
    if (step.status === 'paid') {
      await this.prisma.cashout.updateMany({ where: { id: c.id, status: CashoutStatus.PROCESSING }, data: { status: CashoutStatus.PAID, providerRef: step.providerRef, providerStatus: step.code ?? 'paid', processedAt: this.clock.now(), lastCheckedAt: this.clock.now() } });
      await this.redis.client.del(LEGACY_ACCOUNT_KEY(c.id));
      this.notify(c.userId, c.id);
    } else if (step.status === 'failed') {
      await this.reject(c.id, step.reason);
    } else if (step.status === 'manual') {
      await this.prisma.cashout.update({ where: { id: c.id }, data: { providerStatus: AWAITING_BATCH } });
    } else {
      await this.prisma.cashout.update({ where: { id: c.id }, data: { providerRef: step.providerRef ?? c.providerRef, providerStatus: step.code ?? 'pending', lastCheckedAt: this.clock.now() } });
    }
  }

  /** Marks a cash-out rejected and returns the gems. */
  async reject(id: string, reason: string): Promise<void> {
    const userId = await this.prisma.tx(async (tx) => {
      const c = await tx.cashout.findUniqueOrThrow({ where: { id } });
      if (c.status === CashoutStatus.PAID || c.status === CashoutStatus.REJECTED) return null;
      await tx.cashout.update({ where: { id }, data: { status: CashoutStatus.REJECTED, failureReason: reason, processedAt: this.clock.now(), batchId: null } });
      await this.ledger.move(c.userId, { gems: c.gems, kind: LedgerKind.CASHOUT_REVERSAL, title: 'Cash-out returned', reference: id, idempotencyKey: `cashout-reversal:${id}` }, { tx });
      return c.userId;
    });
    if (userId) {
      await this.events.log({ cashoutId: id, provider: 'vibe', type: 'payout.rejected', message: reason });
      this.wallet.changed([userId]);
      this.notify(userId, id);
    }
  }

  /** Manual payout (sent by bank transfer, or an unknown outcome confirmed). */
  async markPaid(id: string, providerRef: string): Promise<void> {
    const c = await this.prisma.cashout.findUniqueOrThrow({ where: { id } });
    const done = await this.prisma.cashout.updateMany({
      where: { id, status: { in: [CashoutStatus.REVIEW, CashoutStatus.REQUESTED, CashoutStatus.PROCESSING] } },
      data: { status: CashoutStatus.PAID, providerRef, providerStatus: 'paid_by_staff', processedAt: this.clock.now() },
    });
    if (done.count === 0) throw AppError.conflict('This cash-out is already finished');
    await this.redis.client.del(LEGACY_ACCOUNT_KEY(id));
    await this.events.log({ cashoutId: id, provider: 'staff', type: 'payout.marked_paid', message: providerRef });
    this.notify(c.userId, id);
  }

  private notify(userId: string, id: string): void {
    void this.prisma.cashout
      .findUnique({ where: { id } })
      .then((c) => c && this.realtime.toUser(userId, ServerEvent.CashoutUpdated, { id: c.id, status: c.status, failureReason: c.failureReason }))
      .catch(() => undefined);
  }

  /**
   * - Retries REQUESTED ones (an instance died before sending).
   * - Asks providers about PROCESSING ones with an unclear answer (backoff 1 min → 1 h),
   *   except bank payouts waiting for a staff batch.
   */
  @Interval(60_000)
  async sweep(): Promise<void> {
    await this.redis.withLock('cashout-sweep', 55_000, async () => {
      const pending = await this.prisma.cashout.findMany({ where: { status: CashoutStatus.REQUESTED }, take: 50, select: { id: true } });
      for (const c of pending) await this.process(c.id);
      const now = this.clock.now().getTime();
      const open = await this.prisma.cashout.findMany({ where: { status: CashoutStatus.PROCESSING, NOT: { providerStatus: AWAITING_BATCH } }, orderBy: { lastCheckedAt: { sort: 'asc', nulls: 'first' } }, take: 50 });
      for (const c of open) {
        const adapter = this.payouts.adapter(c.method);
        if (!adapter.check) continue;
        const wait = Math.min(MS.hour, 60_000 * 2 ** Math.min(c.attempts, 6));
        if (c.lastCheckedAt && now - c.lastCheckedAt.getTime() < wait) continue;
        const input = await this.input(c);
        if (!input) continue;
        try {
          const step = await adapter.check(input);
          await this.prisma.cashout.update({ where: { id: c.id }, data: { attempts: { increment: 1 }, lastCheckedAt: this.clock.now() } });
          await this.events.log({ cashoutId: c.id, provider: adapter.provider, type: 'payout.checked', code: 'code' in step ? step.code : step.status });
          await this.applyStep(c, step);
        } catch (e) {
          await this.prisma.cashout.update({ where: { id: c.id }, data: { attempts: { increment: 1 }, lastCheckedAt: this.clock.now() } });
          this.logger.warn({ err: e, id: c.id }, 'Payout status check failed');
        }
      }
    });
  }
}

const label = (m: PaymentMethod): string => ({ JAZZCASH: 'JazzCash', EASYPAISA: 'Easypaisa', BANK: 'bank', GOOGLE_PLAY: 'Google Play', APP_STORE: 'App Store', CARD: 'card' })[m];
