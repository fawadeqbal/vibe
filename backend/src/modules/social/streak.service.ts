import { Injectable, Logger } from '@nestjs/common';
import { Friendship, FriendshipStatus, LedgerKind } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock } from '../../common/utils/clock';
import { orderedPair } from '../../common/utils/text';
import { PrismaService, Tx } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { EconomyService } from '../catalog/economy.service';
import { ProgressService } from '../engagement/progress.service';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { applyActivity, isWeeklyMilestone, MIN_STREAK_TO_KEEP, StreakRow, StreakSide, streakView, StreakView } from './streaks';

const rowOf = (f: Friendship): StreakRow => ({ streakCount: f.streakCount, streakBest: f.streakBest, streakDay: f.streakDay, streakLowDay: f.streakLowDay, streakHighDay: f.streakHighDay });
const sideOf = (f: Pick<Friendship, 'userLowId'>, userId: string): StreakSide => (f.userLowId === userId ? 'low' : 'high');

/**
 * Friend streaks (rules in streaks.ts). Activity locks the friendship row,
 * applies the pure rule, and — when a day is counted — pays the weekly
 * reward in the same transaction. XP and the `social:streak` push follow
 * after commit.
 */
@Injectable()
export class StreakService {
  private readonly logger = new Logger(StreakService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly wallet: WalletService,
    private readonly realtime: RealtimeService,
    private readonly clock: Clock,
    private readonly economy: EconomyService,
    private readonly progress: ProgressService,
  ) {}

  /** What `userId` sees for this friendship today (restore price already 0 for VIP). */
  view(f: Friendship, userId: string, vip: boolean): StreakView {
    return streakView(rowOf(f), this.clock.dayIndex(), sideOf(f, userId), vip ? 0 : this.economy.rules.streakRestoreCost);
  }

  /** `userId` messaged or sent a gift to `friendId` (REST chat). Best effort. */
  async noteMessage(userId: string, friendId: string): Promise<void> {
    await this.note(userId, friendId, [userId]);
  }

  /** A call of a minute or more: both sides were active today. Only counts between friends. */
  async noteCall(a: string, b: string): Promise<void> {
    await this.note(a, b, [a, b]);
  }

  private async note(a: string, b: string, active: string[]): Promise<void> {
    try {
      const [low, high] = orderedPair(a, b);
      const day = this.clock.dayIndex();
      const out = await this.prisma.tx(async (tx) => {
        const f = await this.lock(tx, low, high);
        if (!f || f.status !== FriendshipStatus.ACCEPTED) return null;
        const { row, counted } = applyActivity(rowOf(f), active.map((id) => sideOf(f, id)), day);
        const updated = await tx.friendship.update({ where: { id: f.id }, data: row });
        if (!counted) return null;
        await tx.user.updateMany({ where: { id: { in: [low, high] }, bestStreak: { lt: row.streakCount } }, data: { bestStreak: row.streakCount } });
        const paid = isWeeklyMilestone(row.streakCount) ? await this.payWeekly(tx, updated, day) : false;
        return { f: updated, paid };
      });
      if (!out) return;
      if (out.paid) this.wallet.changed([low, high]);
      for (const id of [low, high]) await this.progress.award(id, this.economy.rules.xpPerStreakDay, 'streak');
      await this.announce(out.f);
    } catch (e) {
      this.logger.warn(`streak update ${a}/${b} failed: ${(e as Error).message}`);
    }
  }

  private async lock(tx: Tx, low: string, high: string): Promise<Friendship | null> {
    await tx.$queryRaw`SELECT 1 FROM "Friendship" WHERE "userLowId" = ${low} AND "userHighId" = ${high} FOR UPDATE`;
    return tx.friendship.findUnique({ where: { userLowId_userHighId: { userLowId: low, userHighId: high } } });
  }

  /** Both friends get the weekly coins; keyed by the counted day so it pays once per day reached. */
  private async payWeekly(tx: Tx, f: Friendship, day: number): Promise<boolean> {
    const coins = this.economy.rules.streakWeeklyCoins;
    if (coins <= 0) return false;
    const names = await tx.user.findMany({ where: { id: { in: [f.userLowId, f.userHighId] } }, select: { id: true, name: true } });
    const nameOf = (id: string) => names.find((n) => n.id === id)?.name || 'a friend';
    for (const [me, other] of [
      [f.userLowId, f.userHighId],
      [f.userHighId, f.userLowId],
    ]) {
      await this.ledger.move(me, { coins, kind: LedgerKind.EARN, title: `Streak · ${f.streakCount} days with ${nameOf(other)}`, idempotencyKey: `streak:${f.id}:${day}` }, { tx });
    }
    return true;
  }

  /** Restore a streak that broke yesterday: costs coins (VIP free), and the count carries on. */
  async restore(me: string, friendId: string): Promise<{ streak: StreakView; paidCoins: number }> {
    const [low, high] = orderedPair(me, friendId);
    const today = this.clock.dayIndex();
    const vip = await this.wallet.isVip(me);
    const cost = vip ? 0 : this.economy.rules.streakRestoreCost;
    const { f, paid } = await this.prisma.tx(async (tx) => {
      const f = await this.lock(tx, low, high);
      if (!f || f.status !== FriendshipStatus.ACCEPTED) throw new AppError(ErrorCode.NOT_FRIENDS, 'You are not friends', 403);
      if (!streakView(rowOf(f), today, sideOf(f, me), cost).restorable) throw AppError.conflict('This streak can no longer be restored', ErrorCode.STREAK_NOT_RESTORABLE);
      const friend = await tx.user.findUnique({ where: { id: friendId }, select: { name: true } });
      if (cost > 0) await this.wallet.spend(me, cost, `Streak restored · ${friend?.name || 'a friend'}`, { tx, idempotencyKey: `streak-restore:${f.id}:${today}` });
      const updated = await tx.friendship.update({ where: { id: f.id }, data: { streakDay: today - 1 } });
      return { f: updated, paid: cost };
    });
    if (paid) this.wallet.changed([me]);
    await this.announce(f);
    return { streak: this.view(f, me, vip), paidCoins: paid };
  }

  /** Friends whose streak with `userId` ends tonight unless both talk. */
  async atRiskCount(userId: string): Promise<number> {
    return this.prisma.friendship.count({
      where: { OR: [{ userLowId: userId }, { userHighId: userId }], status: FriendshipStatus.ACCEPTED, streakDay: this.clock.dayIndex() - 1, streakCount: { gte: MIN_STREAK_TO_KEEP } },
    });
  }

  /** Every at-risk pair today (the 20:00 reminder job), in id order from `cursor`. */
  atRiskPairs(cursor: string | undefined, take: number): Promise<Friendship[]> {
    return this.prisma.friendship.findMany({
      where: { status: FriendshipStatus.ACCEPTED, streakDay: this.clock.dayIndex() - 1, streakCount: { gte: MIN_STREAK_TO_KEEP }, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: 'asc' },
      take,
    });
  }

  /** `social:streak` to both friends, each from their own side. */
  private async announce(f: Friendship): Promise<void> {
    const wallets = await this.prisma.wallet.findMany({ where: { userId: { in: [f.userLowId, f.userHighId] } }, select: { userId: true, vipUntil: true } });
    const now = this.clock.now();
    const vip = (id: string) => !!wallets.find((w) => w.userId === id && w.vipUntil && w.vipUntil > now);
    this.realtime.toUser(f.userLowId, ServerEvent.Streak, { friendId: f.userHighId, streak: this.view(f, f.userLowId, vip(f.userLowId)) });
    this.realtime.toUser(f.userHighId, ServerEvent.Streak, { friendId: f.userLowId, streak: this.view(f, f.userHighId, vip(f.userHighId)) });
  }
}
