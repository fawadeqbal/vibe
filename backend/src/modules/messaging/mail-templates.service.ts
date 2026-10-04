import { HttpStatus, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { MailTemplate } from '@prisma/client';
import type Redis from 'ioredis';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { MailFields, MailVars, renderMail, RenderedMail, variablesIn } from './mail-renderer';
import { COMMON_VARIABLES, findSystemTemplate, MESSAGE_VARIABLES, SYSTEM_TEMPLATES, TemplateVariable } from './mail-templates.registry';

const CHANNEL = 'mail-templates:changed';
const TTL_MS = 60_000;
const FIELD_KEYS: (keyof MailFields)[] = ['subject', 'preheader', 'heading', 'body', 'highlight', 'buttonLabel', 'buttonUrl', 'footer'];

export interface TemplateView extends Required<MailFields> {
  key: string;
  name: string;
  description: string;
  usage: 'system' | 'starter';
  custom: boolean;
  edited: boolean;
  variables: TemplateVariable[];
  required: string[];
  updatedAt: string | null;
  updatedById: string | null;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);

const pickFields = (src: Partial<MailFields>): Required<MailFields> =>
  Object.fromEntries(FIELD_KEYS.map((k) => [k, (src[k] ?? '').toString()])) as Required<MailFields>;

/**
 * E-mail templates: built-ins from code, staff overrides and custom
 * templates from the database. Templates are read on hot paths (every
 * sign-in code), so they're cached in memory and refreshed on change
 * across all instances via Redis pub/sub.
 */
@Injectable()
export class MailTemplatesService implements OnModuleInit, OnModuleDestroy {
  private cache: Map<string, MailTemplate> | null = null;
  private loadedAt = 0;
  private sub?: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.sub = this.redis.create('mail-templates-sub');
    await this.sub.subscribe(CHANNEL);
    this.sub.on('message', () => (this.loadedAt = 0));
  }

  async onModuleDestroy(): Promise<void> {
    await this.sub?.quit().catch(() => undefined);
  }

  async list(): Promise<TemplateView[]> {
    const rows = await this.rows();
    const system = SYSTEM_TEMPLATES.map((t) => this.view(t.key, rows.get(t.key) ?? null));
    const custom = [...rows.values()].filter((r) => r.custom).map((r) => this.view(r.key, r));
    return [...system, ...custom.sort((a, b) => a.name.localeCompare(b.name))];
  }

  async get(key: string): Promise<TemplateView> {
    const rows = await this.rows();
    if (!findSystemTemplate(key) && !rows.get(key)?.custom) throw AppError.notFound('Template');
    return this.view(key, rows.get(key) ?? null);
  }

  /** Renders a stored template with the given variables (used to send). */
  async render(key: string, vars: MailVars, opts: { unsubscribeUrl?: string } = {}): Promise<RenderedMail> {
    const t = await this.get(key);
    return renderMail(t, vars, opts);
  }

  /** Renders unsaved fields (live preview), filling unknowns with sample values. */
  preview(fields: MailFields, vars: MailVars = {}, opts: { unsubscribeUrl?: string } = {}): RenderedMail & { variables: string[] } {
    const samples = Object.fromEntries([...COMMON_VARIABLES, ...MESSAGE_VARIABLES, ...SYSTEM_TEMPLATES.flatMap((t) => t.variables)].map((v) => [v.name, v.sample]));
    return { ...renderMail(fields, { ...samples, ...vars }, opts), variables: variablesIn(fields) };
  }

  sampleVars(t: TemplateView): MailVars {
    return Object.fromEntries([...COMMON_VARIABLES, ...t.variables].map((v) => [v.name, v.sample]));
  }

  async update(key: string, fields: MailFields, meta: { name?: string; description?: string }, staffId: string): Promise<TemplateView> {
    const current = await this.get(key);
    const next = pickFields(fields);
    this.check(current, next);
    await this.prisma.mailTemplate.upsert({
      where: { key },
      create: { key, name: meta.name ?? current.name, description: meta.description ?? current.description, custom: current.custom, updatedById: staffId, ...next },
      update: { ...(current.custom ? { name: meta.name, description: meta.description } : {}), updatedById: staffId, ...next },
    });
    await this.changed();
    return this.get(key);
  }

  async create(input: { name: string; description?: string } & Partial<MailFields>, staffId: string): Promise<TemplateView> {
    const base = slug(input.name);
    if (!base) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Give the template a name');
    const rows = await this.rows();
    let key = base;
    for (let i = 2; findSystemTemplate(key) || rows.has(key); i++) key = `${base}_${i}`;
    const starter = findSystemTemplate('general_message')!.defaults;
    const fields = pickFields({ ...starter, ...input });
    await this.prisma.mailTemplate.create({ data: { key, name: input.name.trim(), description: input.description?.trim() ?? '', custom: true, updatedById: staffId, ...fields } });
    await this.changed();
    return this.get(key);
  }

  /** Built-ins go back to their default wording; custom templates are deleted. */
  async reset(key: string): Promise<TemplateView> {
    if (!findSystemTemplate(key)) throw AppError.forbidden('Only built-in templates can be reset. Delete a custom one instead.');
    await this.prisma.mailTemplate.deleteMany({ where: { key } });
    await this.changed();
    return this.get(key);
  }

  async remove(key: string): Promise<void> {
    const t = await this.get(key);
    if (!t.custom) throw AppError.forbidden("Built-in templates can't be deleted");
    await this.prisma.mailTemplate.delete({ where: { key } });
    await this.changed();
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private check(t: TemplateView, f: Required<MailFields>): void {
    if (!f.subject.trim()) throw new AppError(ErrorCode.VALIDATION_FAILED, 'The subject is empty');
    if (!f.body.trim() && !f.highlight.trim()) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Write something in the body');
    const used = new Set(variablesIn(f));
    const missing = t.required.filter((r) => !used.has(r));
    if (missing.length) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, `This e-mail must include ${missing.map((m) => `{{${m}}}`).join(', ')}`, HttpStatus.BAD_REQUEST, { missing });
    }
    const allowed = new Set([...COMMON_VARIABLES, ...MESSAGE_VARIABLES, ...t.variables].map((v) => v.name).concat('year'));
    const unknown = [...used].filter((v) => !allowed.has(v));
    if (unknown.length) throw new AppError(ErrorCode.VALIDATION_FAILED, `Unknown placeholder ${unknown.map((u) => `{{${u}}}`).join(', ')}`, HttpStatus.BAD_REQUEST, { unknown });
    if (f.buttonLabel.trim() && !/^(https?:\/\/|mailto:|\{\{)/i.test(f.buttonUrl.trim())) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'The button link must start with https:// (or mailto:)');
    }
  }

  private view(key: string, row: MailTemplate | null): TemplateView {
    const sys = findSystemTemplate(key);
    const fields = pickFields(row ?? sys!.defaults);
    return {
      key,
      name: row?.custom ? row.name : sys!.name,
      description: row?.custom ? row.description : sys!.description,
      usage: sys?.usage ?? 'starter',
      custom: !!row?.custom,
      edited: !!row && !row.custom,
      variables: [...COMMON_VARIABLES, ...(sys?.variables ?? []), ...(sys?.usage === 'system' ? [] : MESSAGE_VARIABLES)],
      required: sys?.required ?? [],
      updatedAt: row?.updatedAt.toISOString() ?? null,
      updatedById: row?.updatedById ?? null,
      ...fields,
    };
  }

  private async rows(): Promise<Map<string, MailTemplate>> {
    if (this.cache && Date.now() - this.loadedAt < TTL_MS) return this.cache;
    const rows = await this.prisma.mailTemplate.findMany();
    this.cache = new Map(rows.map((r) => [r.key, r]));
    this.loadedAt = Date.now();
    return this.cache;
  }

  private async changed(): Promise<void> {
    this.loadedAt = 0;
    await this.redis.client.publish(CHANNEL, '1');
  }
}
