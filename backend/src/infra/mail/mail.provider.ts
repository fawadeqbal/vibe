import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { AppConfig } from '../../config/app-config.service';
import { safeError, SmtpSettingsService } from './smtp-settings.service';

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
 * Real e-mail over SMTP with the settings from Admin → Settings → E-mail
 * sending (or the server's SMTP_* environment when nothing is saved there).
 * With neither, it prints to the log in development and refuses in production.
 */
@Injectable()
export class SmtpMailProvider extends MailProvider implements OnModuleInit {
  private readonly logger = new Logger('Mail');
  private readonly console = new ConsoleMailProvider();

  constructor(
    private readonly settings: SmtpSettingsService,
    private readonly config: AppConfig,
  ) {
    super();
  }

  /** Checks the login at boot so a wrong password shows up in the log immediately. */
  onModuleInit(): void {
    void this.settings
      .current()
      .then(async ({ cfg, source }) => {
        if (!cfg) return this.logger.log(this.config.isProduction ? 'E-mail is not set up yet: Admin → Settings → E-mail sending' : 'No SMTP settings: e-mail is printed to the log');
        await (await this.settings.transportFor(cfg)).verify();
        this.logger.log(`SMTP ready (${cfg.from}, from ${source === 'admin' ? 'admin settings' : 'environment'})`);
      })
      .catch((e: Error) => this.logger.error(`SMTP login failed: ${safeError(e, '')}. Check Admin → Settings → E-mail sending.`));
  }

  async send(m: MailMessage): Promise<void> {
    const { cfg } = await this.settings.current();
    if (!cfg) {
      if (!this.config.isProduction && this.config.get('MAIL_PROVIDER') !== 'smtp') return this.console.send(m);
      throw new AppError(ErrorCode.MAIL_NOT_CONFIGURED, "We can't send e-mail right now. Please try again later.", HttpStatus.SERVICE_UNAVAILABLE);
    }
    const t = await this.settings.transportFor(cfg);
    await t.sendMail({ from: cfg.from, to: m.to, subject: m.subject, text: m.text, html: m.html, headers: m.headers });
  }
}
