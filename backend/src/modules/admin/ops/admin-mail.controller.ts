import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

import { MailProvider } from '../../../infra/mail/mail.provider';
import { safeError, SmtpSettingsService } from '../../../infra/mail/smtp-settings.service';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { P } from '../core/permissions';
import { Audit, CurrentStaff, RequirePermissions, StaffApi } from '../core/staff-api.decorator';
import type { StaffPrincipal } from '../core/staff.types';

class SmtpDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  @Matches(/^[a-zA-Z0-9.-]+$/, { message: 'host must be a server name like smtp.gmail.com' })
  host!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsBoolean()
  secure!: boolean;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  user!: string;

  /** Shown as the sender, e.g. "Vibe <you@gmail.com>". Empty = Vibe <user>. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  from?: string;

  /** Write-only. Empty = keep the saved one. Never returned. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;
}

/**
 * Admin → Settings → E-mail sending. The password goes in, is checked with
 * the mail server, stored encrypted, and never comes back out — not in
 * responses, not in the audit log (omitBody), not in request logs (redacted).
 */
@StaffApi('settings')
@RequirePermissions(P.OpsSettings)
@Controller('admin/mail/smtp')
export class AdminMailController {
  constructor(
    private readonly smtp: SmtpSettingsService,
    private readonly mail: MailProvider,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Current e-mail (SMTP) settings, without the password' })
  get() {
    return this.smtp.view();
  }

  @Put()
  @ApiOperation({ summary: 'Save SMTP settings: the login is checked with the mail server first (SMTP_LOGIN_FAILED if wrong)' })
  @Audit('mail.smtp_changed', { target: 'setting', omitBody: true, summary: ({ body }) => `${String(body.user)} @ ${String(body.host)}:${String(body.port)}${body.password ? ' · new password' : ''}` })
  save(@CurrentStaff() me: StaffPrincipal, @Body() dto: SmtpDto) {
    return this.smtp.save(dto, me.id);
  }

  @Post('test')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a test e-mail to the signed-in staff member' })
  @Audit('mail.smtp_tested', { target: 'setting', omitBody: true })
  async test(@CurrentStaff() me: StaffPrincipal) {
    const { cfg } = await this.smtp.current();
    try {
      await this.mail.send({
        to: me.email,
        subject: 'Vibe test e-mail',
        text: `This is a test from Admin → Settings → E-mail sending.\n\nIf you can read this, e-mail from Vibe works.\n\n— Vibe`,
      });
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError(ErrorCode.SMTP_LOGIN_FAILED, `Sending failed: ${safeError(e, cfg?.pass ?? '')}`, 400);
    }
    return { sentTo: me.email };
  }
}
