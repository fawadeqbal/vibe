import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { LedgerKind } from '@prisma/client';

import { cursorArgs, CursorQueryDto, Page, toPage } from '../../common/dto/pagination.dto';
import { AppError } from '../../common/errors/app-error';
import { Clock } from '../../common/utils/clock';
import { PrismaService, Tx } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import type { Gift } from '../catalog/economy';
import { EconomyService } from '../catalog/economy.service';
import { LedgerService } from './ledger.service';
import { EngagementService } from '../engagement/engagement.service';
import { ProgressService } from '../engagement/progress.service';
import { isVip, toTransactionView, toWalletView, WALLET_INCLUDE, WalletView } from './wallet.mapper';
import { MoveResult, WALLET_CHANGED, WalletChangedEvent } from './wallet.types';

/**
 * Wallet use-cases other modules call: open, read, spend, credit, gift.
 * After a change, call `changed(userIds)` once the transaction has
 * committed — every open socket of those users gets the new balance.
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly clock: Clock,
    private readonly events: EventEmitter2,
    private readonly realtime: RealtimeService,
    private readonly economy: EconomyService,
    private readonly engagement: EngagementService,
    private readonly progress: ProgressService,
  ) {}

  /** New account: a wallet with the welcome bonus, in the sign-up transaction. */
  async open(userId: string, tx: Tx): Promise<void> {
    await tx.wallet.create({ data: { userId } });
    await this.ledger.move(userId, { coins: this.economy.rules.welcomeCoins, kind: LedgerKind.EARN, title: 'Welcome bonus', idempotencyKey: 'welcome' }, { tx });
  }

  async view(userId: string): Promise<WalletView> {
    const w = await this.prisma.wallet.findUnique({ where: { userId }, include: WALLET_INCLUDE });
    if (!w) throw AppError.notFound('Wallet');
    return toWalletView(w, this.clock, this.economy.rules);
  }

  async isVip(userId: string, tx?: Tx): Promise<boolean> {
    const w = await (tx ?? this.prisma).wallet.findUnique({ where: { userId }, select: { vipUntil: true } });
    return isVip(w, this.clock.now());
  }

  async transactions(userId: string, q: CursorQueryDto): Promise<Page<ReturnType<typeof toTransactionView>>> {
    const rows = await this.prisma.ledgerEntry.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...cursorArgs(q),
    });
    return toPage(rows, q.limit, toTransactionView);
  }

  /** Takes coins or throws INSUFFICIENT_COINS (402). */
  spend(userId: string, coins: number, title: string, opts: { tx?: Tx; idempotencyKey?: string; reference?: string } = {}): Promise<MoveResult> {
    return this.ledger.move(userId, { coins: -coins, kind: LedgerKind.SPEND, title, idempotencyKey: opts.idempotencyKey, reference: opts.reference }, { tx: opts.tx });
  }

  earn(userId: string, coins: number, title: string, opts: { tx?: Tx; idempotencyKey?: string; kind?: LedgerKind } = {}): Promise<MoveResult> {
    return this.ledger.move(userId, { coins, kind: opts.kind ?? LedgerKind.EARN, title, idempotencyKey: opts.idempotencyKey }, { tx: opts.tx });
  }

  /**
   * Sender pays coins, receiver earns gems — both entries and the transfer
   * record commit together or not at all. During Vibe Hour the house adds
   * bonus gems (a separate EARN entry). Then: XP for the receiver, the
   * weekly "most gifted" board, and the gem-goal check.
   */
  async sendGift(fromId: string, toId: string, gift: Gift, ctx: { fromName: string; toName: string; matchId?: string; idempotencyKey?: string }) {
    const gems = this.economy.gemsFor(gift);
    const bonus = this.engagement.bonusGems(gems);
    const result = await this.prisma.tx(async (tx) => {
      const sent = await this.ledger.move(
        fromId,
        { coins: -gift.coins, kind: LedgerKind.GIFT_SENT, title: `${gift.name} to ${ctx.toName}`, idempotencyKey: ctx.idempotencyKey && `gift:${ctx.idempotencyKey}` },
        { tx },
      );
      if (!sent.applied) return null;
      let received = await this.ledger.move(toId, { gems, kind: LedgerKind.GIFT_RECEIVED, title: `${gift.name} from ${ctx.fromName}` }, { tx });
      if (bonus > 0) received = await this.ledger.move(toId, { gems: bonus, kind: LedgerKind.EARN, title: `Vibe Hour bonus · ${gift.name}` }, { tx });
      await tx.user.update({ where: { id: toId }, data: { giftsReceivedCount: { increment: 1 } } });
      await tx.user.update({ where: { id: fromId }, data: { giftsSentCount: { increment: 1 } } });
      const transfer = await tx.giftTransfer.create({ data: { giftId: gift.id, fromId, toId, coins: gift.coins, gems, matchId: ctx.matchId } });
      return { transfer, gemsAfter: received.gems };
    });
    this.changed([fromId, toId]);
    if (result) {
      await this.progress.award(toId, this.economy.rules.xpPerGiftReceived, 'gift');
      await this.progress.addGems(toId, gems + bonus);
      await this.checkGoal(toId, result.gemsAfter - gems - bonus, result.gemsAfter);
    }
    return { transfer: result?.transfer ?? null, gems: gems + bonus, bonusGems: bonus };
  }

  /** Gems crossed the user's goal: tell them once per goal value (`wallet:goal-reached`; offline → push). */
  private async checkGoal(userId: string, before: number, after: number): Promise<void> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { gemGoal: true, gemGoalReachedFor: true } });
    const goal = u?.gemGoal;
    if (!goal || before >= goal || after < goal || u.gemGoalReachedFor === goal) return;
    const won = await this.prisma.user.updateMany({ where: { id: userId, gemGoal: goal, OR: [{ gemGoalReachedFor: null }, { gemGoalReachedFor: { not: goal } }] }, data: { gemGoalReachedFor: goal } });
    if (won.count) this.realtime.toUser(userId, ServerEvent.GoalReached, { goal });
  }

  /** Push fresh balances to the users' sockets (after commit). */
  changed(userIds: string[]): void {
    this.events.emit(WALLET_CHANGED, { userIds: [...new Set(userIds)] } satisfies WalletChangedEvent);
  }

  @OnEvent(WALLET_CHANGED, { async: true })
  async pushBalances(e: WalletChangedEvent): Promise<void> {
    const wallets = await this.prisma.wallet.findMany({ where: { userId: { in: e.userIds } }, include: WALLET_INCLUDE });
    for (const w of wallets) this.realtime.toUser(w.userId, ServerEvent.WalletUpdated, toWalletView(w, this.clock, this.economy.rules));
  }
}
