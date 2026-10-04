import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

import { AppConfig } from '../../config/app-config.service';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Extra headers (e.g. List-Unsubscribe for bulk mail). */
  headers?: Record<string, string>;
}

/** Sends e-mail. Business code depends on this, never on a mail library. */
export abstract class MailProvider {
  abstract send(message: MailMessage): Promise<void>;
}

/** Development: prints the e-mail to the log instead of sending it. */
@Injectable()
export class ConsoleMailProvider extends MailProvider {
  private readonly logger = new Logger('Mail');

  async send(m: MailMessage): Promise<void> {
    this.logger.log(`→ ${m.to} · ${m.subject}\n${m.text}`);
  }
}

/**
 * Any SMTP server. Configured for Gmail by default (smtp.gmail.com:465 with
 * an App Password); point SMTP_HOST/PORT at SES, SendGrid or Mailgun to
 * scale past Gmail's daily sending limit without code changes.
 * Uses a small connection pool so bursts of sign-ins reuse connections.
 */
@Injectable()
export class SmtpMailProvider extends MailProvider implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Mail');
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(config: AppConfig) {
    super();
    const user = config.get('SMTP_USER');
    this.from = config.get('MAIL_FROM') || `Vibe <${user}>`;
    this.transport = createTransport({
      host: config.get('SMTP_HOST'),
      port: config.get('SMTP_PORT'),
      secure: config.get('SMTP_SECURE'),
      // Google shows App Passwords in groups of four ("abcd efgh …"); spaces aren't part of it.
      auth: { user, pass: config.get('SMTP_PASS').replace(/\s+/g, '') },
      pool: true,
      maxConnections: 3,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  /** Checks the login at boot so a wrong App Password shows up in the log immediately. */
  onModuleInit(): void {
    this.transport
      .verify()
      .then(() => this.logger.log(`SMTP ready (${this.from})`))
      .catch((e: Error) => this.logger.error(`SMTP login failed: ${e.message}. Check SMTP_USER / SMTP_PASS (Gmail needs an App Password).`));
  }

  onModuleDestroy(): void {
    this.transport.close();
  }

  async send(m: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, to: m.to, subject: m.subject, text: m.text, html: m.html, headers: m.headers });
  }
}
