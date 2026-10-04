import { HttpStatus, Injectable } from '@nestjs/common';
import { CampaignAudience, CampaignStatus, DeliveryStatus, Prisma } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock } from '../../common/utils/clock';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { audienceWhere, AudienceSpec, emailableWhere, Segment } from './audience';
import { MailFields, renderMail } from './mail-renderer';
import { MailTemplatesService } from './mail-templates.service';
import { unsubscribeUrl } from './unsubscribe';

export interface MessageContent {
  subject: string;
  preheader?: string;
  heading: string;
  body: string;
  buttonLabel?: string;
  buttonUrl?: string;
  footer?: string;
}

export interface NewCampaign extends AudienceSpec, MessageContent {
  name: string;
  sendEmail: boolean;
  sendInApp: boolean;
  important?: boolean;
  templateKey?: string;
}

/** More than this many picked people → use a segment instead. */
export const MAX_PICKED = 1000;

const toFields = (c: MessageContent): MailFields => ({
  subject: c.subject,
  preheader: c.preheader ?? '',
  heading: c.heading,
  body: c.body,
  highlight: '',
  buttonLabel: c.buttonLabel ?? '',
  buttonUrl: c.buttonUrl ?? '',
  footer: c.footer ?? '',
});

/**
 * Messages from staff to users: who they reach, what they look like, and
 * the queue. Sending happens in CampaignWorker, in the background, so a
 * message to a million people never ties up a request.
 */
@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: MailTemplatesService,
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  /** Counts for the composer: how many people, how many by e-mail, a few names. */
  async audience(spec: AudienceSpec, opts: { important?: boolean } = {}) {
    this.checkSpec(spec);
    const where = audienceWhere(spec, this.clock.now());
    const [total, withEmail, reachable, sample] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.count({ where: { AND: [where, { email: { not: null } }] } }),
      this.prisma.user.count({ where: { AND: [where, emailableWhere(!!opts.important)] } }),
      this.prisma.user.findMany({ where, take: 5, orderBy: { lastSeenAt: { sort: 'desc', nulls: 'last' } }, select: { id: true, name: true, avatarUrl: true, email: true } }),
    ]);
    return { total, inApp: total, email: reachable, noEmail: total - withEmail, optedOut: withEmail - reachable, sample };
  }

  /** What one recipient would get: the e-mail and the in-app message. */
  async preview(content: MessageContent, userId?: string) {
    const u = userId ? await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } }) : null;
    const vars = { name: u?.name || 'Sara', email: u?.email ?? 'sara@gmail.com' };
    const email = renderMail(toFields(content), vars, { unsubscribeUrl: unsubscribeUrl(this.config.get('PUBLIC_URL'), u?.id ?? 'preview', this.config.get('JWT_ACCESS_SECRET')) });
    return { email, inApp: this.inAppFor(content, vars) };
  }

  async create(staffId: string, input: NewCampaign) {
    if (!input.sendEmail && !input.sendInApp) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Choose e-mail, in-app, or both');
    this.checkSpec(input);
    this.checkContent(input);
    if (input.templateKey) await this.templates.get(input.templateKey); // must exist
    const { total } = await this.audience(input, { important: input.important });
    if (total === 0) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Nobody matches this audience');
    return this.prisma.campaign.create({
      data: {
        name: input.name.trim(),
        sendEmail: input.sendEmail,
        sendInApp: input.sendInApp,
        important: !!input.important,
        audience: input.audience,
        userIds: input.audience === CampaignAudience.USERS ? [...new Set(input.userIds)] : [],
        segment: input.audience === CampaignAudience.SEGMENT ? ((input.segment ?? {}) as Prisma.InputJsonValue) : Prisma.DbNull,
        templateKey: input.templateKey,
        subject: input.subject.trim(),
        preheader: input.preheader?.trim() ?? '',
        heading: input.heading.trim(),
        body: input.body.trim(),
        buttonLabel: input.buttonLabel?.trim() ?? '',
        buttonUrl: input.buttonUrl?.trim() ?? '',
        footer: input.footer?.trim() ?? '',
        total,
        createdById: staffId,
      },
    });
  }

  async list(q: { cursor?: string; limit: number; status?: CampaignStatus }) {
    const rows = await this.prisma.campaign.findMany({
      where: { status: q.status },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { skip: 1, cursor: { id: q.cursor } } : {}),
    });
    const staff = await this.staffNames(rows.map((r) => r.createdById));
    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((c) => this.view(c, staff));
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  async get(id: string) {
    const c = await this.prisma.campaign.findUnique({ where: { id } });
    if (!c) throw AppError.notFound('Message');
    const [staff, picked] = await Promise.all([
      this.staffNames([c.createdById]),
      // At most MAX_PICKED, so the whole list is cheap; "Send again" needs all of it.
      c.audience === CampaignAudience.USERS ? this.prisma.user.findMany({ where: { id: { in: c.userIds } }, select: { id: true, name: true, avatarUrl: true, verified: true, countryCode: true } }) : [],
    ]);
    const order = new Map(c.userIds.map((u, i) => [u, i]));
    picked.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return { ...this.view(c, staff), picked, pickedCount: c.userIds.length };
  }

  async deliveries(id: string, q: { status?: DeliveryStatus; cursor?: string; limit: number }) {
    const rows = await this.prisma.messageDelivery.findMany({
      where: { campaignId: id, status: q.status },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { skip: 1, cursor: { id: q.cursor } } : {}),
    });
    const users = new Map((await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, name: true, avatarUrl: true } })).map((u) => [u.id, u]));
    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((d) => ({ ...d, user: users.get(d.userId) ?? null, createdAt: d.createdAt.toISOString() }));
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  async cancel(id: string) {
    const r = await this.prisma.campaign.updateMany({ where: { id, status: { in: [CampaignStatus.QUEUED, CampaignStatus.SENDING] } }, data: { status: CampaignStatus.CANCELED, finishedAt: this.clock.now() } });
    if (r.count === 0) throw AppError.conflict('This message has already finished sending');
    return this.get(id);
  }

  inAppFor(c: MessageContent, vars: Record<string, string>) {
    const f = (s: string | undefined) => (s ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? (k === 'appName' ? 'Vibe' : ''));
    return { title: f(c.subject).trim(), body: [f(c.heading), f(c.body)].filter((x) => x.trim()).join('\n\n'), buttonLabel: f(c.buttonLabel).trim(), buttonUrl: f(c.buttonUrl).trim() };
  }

  emailFields(c: MessageContent): MailFields {
    return toFields(c);
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private checkSpec(spec: AudienceSpec): void {
    if (spec.audience === CampaignAudience.USERS) {
      const n = new Set(spec.userIds ?? []).size;
      if (n === 0) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Pick at least one person');
      if (n > MAX_PICKED) throw new AppError(ErrorCode.VALIDATION_FAILED, `Pick up to ${MAX_PICKED} people, or use a segment`, HttpStatus.BAD_REQUEST);
    }
    const s: Segment = spec.segment ?? {};
    for (const d of [s.joinedAfter, s.joinedBefore]) if (d && Number.isNaN(Date.parse(d))) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Invalid date in the segment');
  }

  private checkContent(c: MessageContent): void {
    if (!c.subject.trim()) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Add a subject');
    if (!c.body.trim()) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Write a message');
    if (c.buttonLabel?.trim() && !/^(https?:\/\/|mailto:)/i.test(c.buttonUrl?.trim() ?? '')) throw new AppError(ErrorCode.VALIDATION_FAILED, 'The button link must start with https://');
    const unknown = [...`${c.subject}${c.heading}${c.body}${c.footer ?? ''}`.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).filter((v) => !['name', 'email', 'appName', 'unsubscribeUrl', 'year'].includes(v));
    if (unknown.length) throw new AppError(ErrorCode.VALIDATION_FAILED, `Unknown placeholder {{${unknown[0]}}}. Use {{name}} or {{email}}.`);
  }

  private async staffNames(ids: string[]): Promise<Map<string, string>> {
    const rows = await this.prisma.staffUser.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private view(c: Prisma.CampaignGetPayload<object>, staff: Map<string, string>) {
    return {
      ...c,
      segment: c.segment as Segment | null,
      userIds: undefined,
      createdBy: staff.get(c.createdById) ?? 'Someone',
      createdAt: c.createdAt.toISOString(),
      startedAt: c.startedAt?.toISOString() ?? null,
      finishedAt: c.finishedAt?.toISOString() ?? null,
    };
  }
}
