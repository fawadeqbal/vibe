import { Injectable } from '@nestjs/common';
import { LedgerKind, Wallet } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock, MS } from '../../common/utils/clock';
import { PrismaService, Tx } from '../../infra/prisma/prisma.service';
import { EconomyService } from '../catalog/economy.service';
import { ProgressService } from '../engagement/progress.service';
import { isProfileComplete } from '../users/profile.rules';
import { AdsService } from './ads/ads.service';
import { LedgerService } from './ledger.service';
import { adsLeftToday, freeFriendRequestsLeft, isBoosted, nextCheckInDay } from './wallet.mapper';
import { WalletService } from './wallet.service';

/**
 * Free coins and per-day allowances. Each use-case locks the wallet row,
 * re-checks its rule, and moves coins in the same transaction — so a
 * double-tap can never claim twice.
 */
@Injectable()
export class RewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly wallet: WalletService,
    private readonly clock: Clock,
    private readonly ads: AdsService,
    private readonly economy: EconomyService,
    private readonly progress: ProgressService,
  ) {}

  private async locked(tx: Tx, userId: string): Promise<Wallet> {
    await tx.$queryRaw`SELECT 1 FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const w = await tx.wallet.findUnique({ where: { userId } });
    if (!w) throw AppError.notFound('Wallet');
    return w;
  }

  async checkIn(userId: string): Promise<{ reward: number; day: number }> {
    const res = await this.prisma.tx(async (tx) => {
      const w = await this.locked(tx, userId);
      if (this.clock.sameDay(w.lastCheckInAt)) throw AppError.conflict('Already checked in today', ErrorCode.ALREADY_CLAIMED);
      const day = nextCheckInDay(w, this.clock, this.economy.rules);
      const reward = this.economy.rules.checkInRewards[day];
      await tx.wallet.update({ where: { userId }, data: { streakDay: day + 1, lastCheckInAt: this.clock.now() } });
      await this.ledger.move(userId, { coins: reward, kind: LedgerKind.EARN, title: `Daily check-in · day ${day + 1}` }, { tx });
      return { reward, day };
    });
    this.wallet.changed([userId]);
    await this.progress.award(userId, this.economy.rules.xpPerCheckIn, 'check-in');
    return res;
  }

  async rewardAd(userId: string, adToken: string): Promise<{ reward: number; leftToday: number }> {
    const before = await this.prisma.wallet.findUniqueOrThrow({ where: { userId } });
    if (adsLeftToday(before, this.clock, this.economy.rules) <= 0) throw AppError.conflict("You've watched all of today's ads", ErrorCode.DAILY_LIMIT_REACHED);
    // Claim the verified view first (may wait a moment for AdMob's callback), outside the wallet lock.
    if (!(await this.ads.consume(userId, adToken))) throw new AppError(ErrorCode.AD_NOT_VERIFIED, 'Ad view could not be verified');
    const res = await this.prisma.tx(async (tx) => {
      const w = await this.locked(tx, userId);
      const left = adsLeftToday(w, this.clock, this.economy.rules);
      if (left <= 0) throw AppError.conflict("You've watched all of today's ads", ErrorCode.DAILY_LIMIT_REACHED);
      const today = this.clock.dayOf();
      await tx.wallet.update({
        where: { userId },
        data: { adsDay: today, adsWatchedToday: this.clock.isToday(w.adsDay) ? w.adsWatchedToday + 1 : 1 },
      });
      await this.ledger.move(userId, { coins: this.economy.rules.rewardedAdCoins, kind: LedgerKind.EARN, title: 'Watched an ad', reference: adToken }, { tx });
      return { reward: this.economy.rules.rewardedAdCoins, leftToday: left - 1 };
    });
    this.wallet.changed([userId]);
    return res;
  }

  async claimProfileBonus(userId: string): Promise<{ reward: number }> {
    await this.prisma.tx(async (tx) => {
      const w = await this.locked(tx, userId);
      if (w.profileBonusClaimed) throw AppError.conflict('Already claimed', ErrorCode.ALREADY_CLAIMED);
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (!isProfileComplete(user)) throw new AppError(ErrorCode.PROFILE_INCOMPLETE, 'Add a photo, a bio and 3 interests first');
      await tx.wallet.update({ where: { userId }, data: { profileBonusClaimed: true } });
      await this.ledger.move(userId, { coins: this.economy.rules.profileCompleteCoins, kind: LedgerKind.EARN, title: 'Profile completed', idempotencyKey: 'profile-bonus' }, { tx });
    });
    this.wallet.changed([userId]);
    return { reward: this.economy.rules.profileCompleteCoins };
  }

  /** Paid priority in the queue; a free boost credit (win-back) is used before coins. */
  async boost(userId: string): Promise<{ until: string; free: boolean; paidCoins: number }> {
    const r = await this.prisma.tx(async (tx) => {
      const w = await this.locked(tx, userId);
      if (isBoosted(w, this.clock.now())) return { end: w.boostUntil!, free: false, paidCoins: 0 };
      const free = w.freeBoosts > 0;
      if (!free) await this.wallet.spend(userId, this.economy.rules.boostCost, `Boost · ${this.economy.rules.boostMinutes} min priority`, { tx });
      const end = this.clock.plus(this.economy.rules.boostMinutes * MS.minute);
      await tx.wallet.update({ where: { userId }, data: { boostUntil: end, ...(free ? { freeBoosts: { decrement: 1 } } : {}) } });
      return { end, free, paidCoins: free ? 0 : this.economy.rules.boostCost };
    });
    this.wallet.changed([userId]);
    return { until: r.end.toISOString(), free: r.free, paidCoins: r.paidCoins };
  }

  /**
   * A friend request: free while today's allowance lasts, then coins.
   * Runs inside the caller's transaction (the request is created there too).
   */
  async payForFriendRequest(userId: string, toName: string, tx: Tx): Promise<{ paidCoins: number }> {
    const w = await this.locked(tx, userId);
    if (freeFriendRequestsLeft(w, this.clock, this.economy.rules) > 0) {
      await tx.wallet.update({
        where: { userId },
        data: { friendRequestsDay: this.clock.dayOf(), freeFriendRequestsToday: this.clock.isToday(w.friendRequestsDay) ? w.freeFriendRequestsToday + 1 : 1 },
      });
      return { paidCoins: 0 };
    }
    await this.wallet.spend(userId, this.economy.rules.friendRequestCost, `Friend request · ${toName}`, { tx });
    return { paidCoins: this.economy.rules.friendRequestCost };
  }
}
