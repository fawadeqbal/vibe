import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ log: [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }] });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Runs `fn` in a transaction, or joins the caller's transaction when one
   * is passed in — so services compose (`wallet.spend(…, tx)` inside a
   * larger unit of work) without nesting transactions.
   */
  async tx<T>(fn: (tx: Tx) => Promise<T>, outer?: Tx, opts?: { isolation?: Prisma.TransactionIsolationLevel }): Promise<T> {
    if (outer) return fn(outer);
    return this.$transaction(fn, { isolationLevel: opts?.isolation, maxWait: 5000, timeout: 15000 });
  }
}
