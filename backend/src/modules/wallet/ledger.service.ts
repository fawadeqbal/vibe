import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService, Tx } from '../../infra/prisma/prisma.service';
import { Movement, MoveOptions, MoveResult } from './wallet.types';

/**
 * The only code that changes a balance. One guarded UPDATE moves the
 * balance (it cannot go below zero, even under concurrency) and the ledger
 * entry is written in the same transaction with the resulting balance.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async move(userId: string, m: Movement, opts: MoveOptions = {}): Promise<MoveResult> {
    const coins = Math.trunc(m.coins ?? 0);
    const gems = Math.trunc(m.gems ?? 0);
    if (m.idempotencyKey) {
      const prior = await (opts.tx ?? this.prisma).ledgerEntry.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: m.idempotencyKey } } });
      if (prior) return { entry: prior, coins: prior.balanceCoins, gems: prior.balanceGems, applied: false };
    }
    try {
      return await this.prisma.tx((tx) => this.apply(tx, userId, coins, gems, m), opts.tx);
    } catch (e) {
      // Lost a race on the same idempotency key: the other request applied it.
      if (m.idempotencyKey && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && !opts.tx) {
        const prior = await this.prisma.ledgerEntry.findUniqueOrThrow({ where: { userId_idempotencyKey: { userId, idempotencyKey: m.idempotencyKey } } });
        return { entry: prior, coins: prior.balanceCoins, gems: prior.balanceGems, applied: false };
      }
      throw e;
    }
  }

  private async apply(tx: Tx, userId: string, coins: number, gems: number, m: Movement): Promise<MoveResult> {
    const rows = await tx.$queryRaw<{ coins: number; gems: number }[]>`
      UPDATE "Wallet"
         SET "coins" = "coins" + ${coins}, "gems" = "gems" + ${gems}, "updatedAt" = now()
       WHERE "userId" = ${userId} AND "coins" + ${coins} >= 0 AND "gems" + ${gems} >= 0
   RETURNING "coins", "gems"`;
    if (rows.length === 0) {
      const w = await tx.wallet.findUnique({ where: { userId }, select: { coins: true, gems: true } });
      if (!w) throw AppError.notFound('Wallet');
      if (w.coins + coins < 0) throw AppError.insufficientCoins(-coins, w.coins);
      throw new AppError(ErrorCode.INSUFFICIENT_GEMS, 'Not enough gems', 402, { needed: -gems, have: w.gems });
    }
    const [balance] = rows;
    const entry = await tx.ledgerEntry.create({
      data: {
        userId,
        kind: m.kind,
        title: m.title,
        coins,
        gems,
        usdCents: m.usdCents ?? 0,
        method: m.method,
        reference: m.reference,
        idempotencyKey: m.idempotencyKey,
        balanceCoins: balance.coins,
        balanceGems: balance.gems,
      },
    });
    return { entry, coins: balance.coins, gems: balance.gems, applied: true };
  }
}
