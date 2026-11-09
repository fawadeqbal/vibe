import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { LegalDocument } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { fillDefaults, LEGAL_DEFAULTS, LEGAL_SLUGS, LegalSlug } from './legal-defaults';
import { renderLegalMarkdown } from './legal-markdown';

export interface LegalView {
  slug: LegalSlug;
  title: string;
  summary: string;
  markdown: string;
  /** Safe HTML from the markdown (everything escaped, only our tags). */
  html: string;
  version: number;
  updatedAt: string;
  /** Where the website shows it, e.g. https://vibe.fawadiqbal.dev/terms/ */
  url: string;
}

export interface LegalEdit {
  title: string;
  summary: string;
  markdown: string;
}

/**
 * Terms, Privacy Policy, Community Guidelines and Child Safety Standards.
 * Seeded from LEGAL_DEFAULTS when missing (first start), then edited in
 * admin → Legal pages. Public: GET /v1/legal/:slug (the website's /terms/ …).
 */
@Injectable()
export class LegalService implements OnModuleInit {
  private readonly logger = new Logger(LegalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seed().catch((e) => this.logger.warn(`Legal pages not seeded: ${(e as Error).message}`));
  }

  /** Adds any missing page with its default text; never touches edited ones. */
  async seed(): Promise<number> {
    const have = new Set((await this.prisma.legalDocument.findMany({ select: { slug: true } })).map((d) => d.slug));
    const missing = LEGAL_DEFAULTS.filter((d) => !have.has(d.slug));
    if (!missing.length) return 0;
    const vars = this.vars();
    await this.prisma.legalDocument.createMany({
      data: missing.map((d) => ({ slug: d.slug, title: d.title, summary: d.summary, markdown: fillDefaults(d.markdown, vars) })),
      skipDuplicates: true,
    });
    this.logger.log(`Seeded legal pages: ${missing.map((d) => d.slug).join(', ')}`);
    return missing.length;
  }

  async list(): Promise<LegalView[]> {
    const rows = await this.prisma.legalDocument.findMany();
    return LEGAL_SLUGS.flatMap((s) => {
      const r = rows.find((x) => x.slug === s);
      return r ? [this.view(r)] : [];
    });
  }

  async get(slug: string): Promise<LegalView> {
    const row = isSlug(slug) ? await this.prisma.legalDocument.findUnique({ where: { slug } }) : null;
    if (!row) throw AppError.notFound('Page');
    return this.view(row);
  }

  async save(slug: string, edit: LegalEdit, staffId: string): Promise<LegalView> {
    const current = await this.get(slug);
    const row = await this.prisma.legalDocument.update({
      where: { slug: current.slug },
      data: { title: edit.title.trim(), summary: edit.summary.trim(), markdown: edit.markdown, version: { increment: 1 }, updatedById: staffId },
    });
    return this.view(row);
  }

  /** Back to the text Vibe shipped with (counts as a new version). */
  async reset(slug: string, staffId: string): Promise<LegalView> {
    const d = LEGAL_DEFAULTS.find((x) => x.slug === slug);
    if (!d) throw AppError.notFound('Page');
    return this.save(slug, { title: d.title, summary: d.summary, markdown: fillDefaults(d.markdown, this.vars()) }, staffId);
  }

  preview(markdown: string): { html: string } {
    return { html: renderLegalMarkdown(markdown) };
  }

  /** The Terms version people agree to when they sign up now. */
  async termsVersion(): Promise<number | null> {
    return (await this.prisma.legalDocument.findUnique({ where: { slug: 'terms' }, select: { version: true } }))?.version ?? null;
  }

  private view(r: LegalDocument): LegalView {
    return { slug: r.slug as LegalSlug, title: r.title, summary: r.summary, markdown: r.markdown, html: renderLegalMarkdown(r.markdown), version: r.version, updatedAt: r.updatedAt.toISOString(), url: `${this.vars().site}/${r.slug}/` };
  }

  private vars() {
    const email = this.config.get('SUPPORT_EMAIL') || /<([^>]+)>/.exec(this.config.get('MAIL_FROM') ?? '')?.[1] || 'support@vibe.fawadiqbal.dev';
    const app = this.config.get('WEB_APP_URL').replace(/\/$/, '');
    const site = (this.config.get('SITE_URL') || app.replace('://app.', '://')).replace(/\/$/, '');
    return { email, site, app };
  }
}

export function isSlug(s: string): s is LegalSlug {
  return (LEGAL_SLUGS as readonly string[]).includes(s);
}
