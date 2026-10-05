import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { Prisma, WebhookStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString } from 'class-validator';

import { PrismaService } from '../../../infra/prisma/prisma.service';
import { IntegrationRegistry } from '../../../integrations/core/integration-registry.service';
import { redact } from '../../../integrations/core/redact';
import { WebhookInbox } from '../../../integrations/core/webhook-inbox.service';
import { AdminListQuery, toAdminPage } from '../core/admin-query';
import { P } from '../core/permissions';
import { Audit, RequirePermissions, StaffApi } from '../core/staff-api.decorator';

class WebhookQuery extends AdminListQuery {
  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsIn(Object.values(WebhookStatus))
  status?: WebhookStatus;
}

/** Integrations page: what's live, what keys are missing, and the provider webhook log. */
@StaffApi('integrations')
@Controller('admin')
export class IntegrationsController {
  constructor(
    private readonly registry: IntegrationRegistry,
    private readonly prisma: PrismaService,
    private readonly inbox: WebhookInbox,
  ) {}

  @Get('integrations')
  @RequirePermissions(P.OpsIntegrations)
  @ApiOperation({ summary: 'Every provider integration: mode (live/dev/off), missing env keys, URLs to give the provider' })
  async list() {
    const items = await this.registry.statuses();
    const since = new Date(Date.now() - 24 * 3600_000);
    const hooks = await this.prisma.webhookEvent.groupBy({ by: ['provider', 'status'], where: { receivedAt: { gte: since } }, _count: { _all: true } });
    return {
      items,
      summary: { live: items.filter((i) => i.mode === 'live').length, dev: items.filter((i) => i.mode === 'dev').length, off: items.filter((i) => i.mode === 'off').length },
      webhooks24h: hooks.map((h) => ({ provider: h.provider, status: h.status, count: h._count._all })),
    };
  }

  @Get('webhooks')
  @RequirePermissions(P.OpsIntegrations)
  async webhooks(@Query() q: WebhookQuery) {
    const where: Prisma.WebhookEventWhereInput = { ...(q.provider ? { provider: q.provider } : {}), ...(q.status ? { status: q.status } : {}) };
    const rows = await this.prisma.webhookEvent.findMany({
      where,
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { skip: 1, cursor: { id: q.cursor } } : {}),
      select: { id: true, provider: true, eventId: true, eventType: true, status: true, error: true, attempts: true, subjectType: true, subjectId: true, receivedAt: true, processedAt: true },
    });
    return toAdminPage(rows, q.limit, (r) => r);
  }

  @Get('webhooks/:id')
  @RequirePermissions(P.OpsIntegrations)
  async webhook(@Param('id') id: string) {
    const e = await this.prisma.webhookEvent.findUniqueOrThrow({ where: { id } });
    return { ...e, payload: redact(e.payload) };
  }

  @Post('webhooks/:id/retry')
  @HttpCode(200)
  @RequirePermissions(P.OpsIntegrations)
  @Audit('webhook.retried', { target: 'webhook', param: 'id' })
  async retry(@Param('id') id: string) {
    const e = await this.inbox.retry(id);
    return { id: e.id, status: e.status, error: e.error, attempts: e.attempts };
  }
}
