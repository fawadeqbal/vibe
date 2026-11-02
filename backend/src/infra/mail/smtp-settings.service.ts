import { HttpStatus, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createTransport, type Transporter } from 'nodemailer';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { SecretBox } from '../../common/utils/secret-box';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';

/** The AppSetting row holding the admin's SMTP settings (password sealed, never returned). */
export const SMTP_SETTING_KEY = 'mail.smtp';
/** How often other API instances re-read the settings (a save applies at once on this one). */
const RELOAD_MS = 30_000;

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

interface Stored {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  /** AES-GCM sealed (DATA_ENCRYPTION_KEY, purpose "smtp"). */
  passSealed: string;
}

/** What the admin panel sees: everything but the password. */
export interface SmtpView {
  /** admin = saved in Settings; env = the server's SMTP_* settings; none = e-mail is off. */
  source: 'admin' | 'env' | 'none';
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  passwordSet: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface SmtpInput {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from?: string;
  /** Empty or missing = keep the saved password. */
  password?: string;
}

/** Minimal transport surface (tests swap in a fake). */
export type MailTransport = Pick<Transporter, 'sendMail' | 'verify' | 'close'>;

/** Google shows App Passwords in groups of four ("abcd efgh …"); spaces aren't part of it. */
const cleanPass = (p: string) => p.replace(/\s+/g, '');

/**
 * SMTP settings managed from Admin → Settings → E-mail sending. The password
 * is sealed at rest, is never sent back to any client and never logged; a
 * new login is checked against the server before it replaces the old one.
 * The server's SMTP_* environment is only a fallback when nothing is saved.
 */
@Injectable()
export class SmtpSettingsService implements OnModuleDestroy {
  private readonly logger = new Logger('Mail');
  private readonly box: SecretBox;
  private cached: { cfg: SmtpConfig | null; source: SmtpView['source']; at: number } | null = null;
  private transport: { fingerprint: string; t: MailTransport } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {
    this.box = new SecretBox(config.dataKey('smtp'));
  }

  /** Builds a pooled SMTP transport (swapped out in tests). */
  makeTransport(c: SmtpConfig): MailTransport {
    return createTransport({
      host: c.host,
      port: c.port,
      secure: c.secure,
      auth: { user: c.user, pass: c.pass },
      pool: true,
      maxConnections: 3,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  private fromEnv(): SmtpConfig | null {
    const user = this.config.get('SMTP_USER');
    const pass = cleanPass(this.config.get('SMTP_PASS'));
    if (this.config.get('MAIL_PROVIDER') !== 'smtp' || !user || !pass) return null;
    return { host: this.config.get('SMTP_HOST'), port: this.config.get('SMTP_PORT'), secure: this.config.get('SMTP_SECURE'), user, pass, from: this.config.get('MAIL_FROM') || `Vibe <${user}>` };
  }

  private async readStored(): Promise<{ s: Stored; updatedAt: Date; updatedById: string | null } | null> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: SMTP_SETTING_KEY } });
    if (!row) return null;
    const v = row.value as Partial<Stored> | null;
    if (!v?.host || !v.user || !v.passSealed) return null;
    return { s: v as Stored, updatedAt: row.updatedAt, updatedById: row.updatedById };
  }

  /** The settings mail goes out with now (admin's first, else the environment's), or null. */
  async current(): Promise<{ cfg: SmtpConfig | null; source: SmtpView['source'] }> {
    if (this.cached && Date.now() - this.cached.at < RELOAD_MS) return this.cached;
    let cfg: SmtpConfig | null = null;
    let source: SmtpView['source'] = 'none';
    const stored = await this.readStored();
    if (stored) {
      try {
        cfg = { host: stored.s.host, port: stored.s.port, secure: stored.s.secure, user: stored.s.user, from: stored.s.from || `Vibe <${stored.s.user}>`, pass: this.box.open(stored.s.passSealed) };
        source = 'admin';
      } catch {
        this.logger.error('Saved SMTP password could not be read (the data key changed?). Save it again in Admin → Settings.');
      }
    }
    if (!cfg) {
      cfg = this.fromEnv();
      if (cfg) source = 'env';
    }
    this.cached = { cfg, source, at: Date.now() };
    return this.cached;
  }

  private fingerprint(c: SmtpConfig): string {
    return createHash('sha256').update([c.host, c.port, c.secure, c.user, c.pass].join('|')).digest('hex');
  }

  /** The pooled transport for the current settings (rebuilt when they change). */
  async transportFor(c: SmtpConfig): Promise<MailTransport> {
    const fp = this.fingerprint(c);
    if (this.transport?.fingerprint === fp) return this.transport.t;
    this.transport?.t.close();
    this.transport = { fingerprint: fp, t: this.makeTransport(c) };
    return this.transport.t;
  }

  async view(): Promise<SmtpView> {
    const stored = await this.readStored();
    if (stored) {
      const by = stored.updatedById ? await this.prisma.staffUser.findUnique({ where: { id: stored.updatedById }, select: { email: true } }) : null;
      return { source: 'admin', host: stored.s.host, port: stored.s.port, secure: stored.s.secure, user: stored.s.user, from: stored.s.from, passwordSet: true, updatedAt: stored.updatedAt.toISOString(), updatedBy: by?.email ?? null };
    }
    const env = this.fromEnv();
    if (env) return { source: 'env', host: env.host, port: env.port, secure: env.secure, user: env.user, from: env.from, passwordSet: true, updatedAt: null, updatedBy: null };
    return { source: 'none', host: this.config.get('SMTP_HOST'), port: this.config.get('SMTP_PORT'), secure: this.config.get('SMTP_SECURE'), user: '', from: '', passwordSet: false, updatedAt: null, updatedBy: null };
  }

  /**
   * Checks the login with the SMTP server, then saves. A wrong password is
   * refused (SMTP_LOGIN_FAILED) and the old settings keep working.
   */
  async save(input: SmtpInput, staffId: string): Promise<SmtpView> {
    const stored = await this.readStored();
    let pass = cleanPass(input.password ?? '');
    if (!pass) {
      if (stored && stored.s.user === input.user.trim()) pass = this.openOr(stored.s.passSealed);
      if (!pass) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Enter the password', HttpStatus.BAD_REQUEST);
    }
    const cfg: SmtpConfig = { host: input.host.trim(), port: input.port, secure: input.secure, user: input.user.trim(), from: (input.from ?? '').trim(), pass };
    await this.check(cfg);
    const value: Stored = { host: cfg.host, port: cfg.port, secure: cfg.secure, user: cfg.user, from: cfg.from, passSealed: this.box.seal(pass) };
    await this.prisma.appSetting.upsert({ where: { key: SMTP_SETTING_KEY }, create: { key: SMTP_SETTING_KEY, value: { ...value }, updatedById: staffId }, update: { value: { ...value }, updatedById: staffId } });
    this.cached = null;
    this.logger.log(`SMTP settings changed (${cfg.user} @ ${cfg.host}:${cfg.port})`);
    return this.view();
  }

  private openOr(sealed: string): string {
    try {
      return this.box.open(sealed);
    } catch {
      return '';
    }
  }

  /** Logs in once with these settings; throws a readable error when it fails. */
  private async check(cfg: SmtpConfig): Promise<void> {
    const t = this.makeTransport(cfg);
    try {
      await Promise.race([t.verify(), new Promise((_, reject) => setTimeout(() => reject(new Error('The mail server did not answer in time')), 15_000))]);
    } catch (e) {
      throw new AppError(ErrorCode.SMTP_LOGIN_FAILED, `Couldn't sign in to ${cfg.host}: ${safeError(e, cfg.pass)}`, HttpStatus.BAD_REQUEST);
    } finally {
      t.close();
    }
  }

  onModuleDestroy(): void {
    this.transport?.t.close();
  }
}

/** The server's reason, without ever echoing the password. */
export function safeError(e: unknown, pass: string): string {
  let msg = (e as Error)?.message ?? 'unknown error';
  if (pass) msg = msg.split(pass).join('••••');
  return msg.replace(/\s+/g, ' ').slice(0, 200);
}
