import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma, WebhookEvent, WebhookStatus } from '@prisma/client';
import { createHash } from 'node:crypto';

import { Clock } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { redact } from './redact';

export interface WebhookOutcome {
  /** processed = it changed something; ignored = understood but nothing to do. */
  status: 'processed' | 'ignored';
  subjectType?: string;
  subjectId?: string;
  note?: string;
}

export type WebhookHandler = (event: WebhookEvent) => Promise<WebhookOutcome>;

const MAX_ATTEMPTS = 6;

/**
 * Every provider callback goes through here:
 *  1. `receive` stores it (dedupe on provider + event id) — before any work,
 *     so nothing is lost if processing crashes;
 *  2. the provider's handler runs; the result (or error) is recorded;
 *  3. failed events are retried with backoff by `sweep`, and staff can
 *     retry by hand from the admin panel.
 * Handlers must be idempotent (they are: purchases/cash-outs move by status).
 */
@Injectable()
export class WebhookInbox {
  private readonly logger = new Logger(WebhookInbox.name);
  private readonly handlers = new Map<string, WebhookHandler>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly clock: Clock,
  ) {}

  register(provider: string, handler: WebhookHandler): void {
    this.handlers.set(provider, handler);
  }

  /** Store and process one callback. Never throws for processing errors (they're recorded and retried). */
  async receive(provider: string, input: { eventId?: string; eventType?: string; payload: unknown; headers?: Record<string, unknown> }): Promise<{ event: WebhookEvent; duplicate: boolean }> {
    const payload = (input.payload ?? {}) as Prisma.InputJsonValue;
    const eventId = input.eventId || createHash('sha256').update(JSON.stringify(input.payload ?? {})).digest('hex').slice(0, 40);
    let event: WebhookEvent;
    try {
      event = await this.prisma.webhookEvent.create({
        data: { provider, eventId, eventType: input.eventType, payload, headers: input.headers ? (redact(input.headers) as Prisma.InputJsonValue) : undefined },
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      event = await this.prisma.webhookEvent.findUniqueOrThrow({ where: { provider_eventId: { provider, eventId } } });
      if (event.status === WebhookStatus.PROCESSED || event.status === WebhookStatus.IGNORED) return { event, duplicate: true };
    }
    return { event: await this.process(event), duplicate: false };
  }

  /** Runs the handler for a stored event and records the outcome. */
  async process(event: WebhookEvent): Promise<WebhookEvent> {
    const handler = this.handlers.get(event.provider);
    if (!handler) {
      return this.prisma.webhookEvent.update({ where: { id: event.id }, data: { status: WebhookStatus.FAILED, error: `No handler for ${event.provider}`, attempts: { increment: 1 } } });
    }
    try {
      const r = await handler(event);
      return await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: r.status === 'processed' ? WebhookStatus.PROCESSED : WebhookStatus.IGNORED,
          subjectType: r.subjectType,
          subjectId: r.subjectId,
          error: r.note ?? null,
          attempts: { increment: 1 },
          processedAt: this.clock.now(),
        },
      });
    } catch (e) {
      this.logger.error({ err: e, provider: event.provider, eventId: event.eventId }, 'Webhook processing failed');
      return this.prisma.webhookEvent.update({ where: { id: event.id }, data: { status: WebhookStatus.FAILED, error: String((e as Error).message ?? e).slice(0, 500), attempts: { increment: 1 } } });
    }
  }

  /** Staff "retry" button. */
  async retry(id: string): Promise<WebhookEvent> {
    const event = await this.prisma.webhookEvent.findUniqueOrThrow({ where: { id } });
    return this.process(event);
  }

  /** Retries failed events with backoff: 1, 2, 4, 8, 16 minutes. */
  @Interval(60_000)
  async sweep(): Promise<void> {
    await this.redis.withLock('webhook-sweep', 55_000, async () => {
      const now = this.clock.now().getTime();
      const failed = await this.prisma.webhookEvent.findMany({
        where: { status: { in: [WebhookStatus.FAILED, WebhookStatus.RECEIVED] }, attempts: { lt: MAX_ATTEMPTS }, receivedAt: { lt: new Date(now - 60_000) } },
        orderBy: { receivedAt: 'asc' },
        take: 50,
      });
      for (const e of failed) {
        const due = e.receivedAt.getTime() + 60_000 * 2 ** Math.max(0, e.attempts - 1);
        if (due <= now) await this.process(e);
      }
    });
  }
}
