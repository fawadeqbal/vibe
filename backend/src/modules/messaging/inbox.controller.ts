import { Controller, Get, Header, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { cursorArgs, CursorQueryDto, toPage } from '../../common/dto/pagination.dto';
import { OK } from '../../common/dto/ok.dto';
import { AppError } from '../../common/errors/app-error';
import { Clock } from '../../common/utils/clock';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SkipMaintenance } from '../settings/maintenance.guard';
import { verifyUnsubscribe } from './unsubscribe';

class UnsubscribeQuery {
  @IsString()
  @Length(10, 40)
  u!: string;

  @IsString()
  @Length(10, 64)
  t!: string;
}

const view = (m: { id: string; title: string; body: string; buttonLabel: string; buttonUrl: string; readAt: Date | null; createdAt: Date }) => ({
  id: m.id,
  title: m.title,
  body: m.body,
  buttonLabel: m.buttonLabel || null,
  buttonUrl: m.buttonUrl || null,
  read: !!m.readAt,
  createdAt: m.createdAt.toISOString(),
});

/** "Messages from Vibe": the in-app inbox for messages staff send. */
@ApiTags('inbox')
@ApiBearerAuth()
@Controller('inbox')
export class InboxController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  @Get()
  async list(@CurrentUser('id') userId: string, @Query() q: CursorQueryDto) {
    const rows = await this.prisma.userMessage.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...cursorArgs(q) });
    return toPage(rows, q.limit, view);
  }

  @Get('unread')
  async unread(@CurrentUser('id') userId: string) {
    return { count: await this.prisma.userMessage.count({ where: { userId, readAt: null } }) };
  }

  @Post(':id/read')
  @HttpCode(200)
  async read(@CurrentUser('id') userId: string, @Param('id') id: string) {
    const r = await this.prisma.userMessage.updateMany({ where: { id, userId }, data: { readAt: this.clock.now() } });
    if (r.count === 0) throw AppError.notFound('Message');
    return OK;
  }

  @Post('read-all')
  @HttpCode(200)
  async readAll(@CurrentUser('id') userId: string) {
    await this.prisma.userMessage.updateMany({ where: { userId, readAt: null }, data: { readAt: this.clock.now() } });
    return OK;
  }
}

/** The "Stop e-mail updates" link in message e-mails (and one-click unsubscribe). */
@ApiTags('inbox')
@Public()
@SkipMaintenance()
@Controller('email')
export class UnsubscribeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  @Get('unsubscribe')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Link from e-mails: turns off e-mail updates for that person' })
  async page(@Query() q: UnsubscribeQuery) {
    const ok = await this.apply(q);
    return page(ok ? "You won't get e-mail updates from Vibe any more" : 'This link is not valid', ok ? 'You can turn them back on any time in the app: Profile → E-mail updates. Sign-in codes and important account notices still arrive.' : 'Open the latest e-mail from Vibe and use its link again.');
  }

  /** RFC 8058 one-click: mail apps POST here from their own "Unsubscribe" button. */
  @Post('unsubscribe')
  @HttpCode(200)
  async oneClick(@Query() q: UnsubscribeQuery) {
    await this.apply(q);
    return OK;
  }

  private async apply(q: UnsubscribeQuery): Promise<boolean> {
    if (!verifyUnsubscribe(q.u, q.t, this.config.get('JWT_ACCESS_SECRET'))) return false;
    await this.prisma.user.updateMany({ where: { id: q.u }, data: { marketingEmails: false } });
    return true;
  }
}

const page = (title: string, text: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vibe</title></head>
<body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f3f7;color:#16151c">
<main style="max-width:440px;margin:15vh auto;background:#fff;border-radius:16px;padding:32px">
<div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#ec4899,#7c3aed);color:#fff;font-weight:700;font-size:20px;line-height:40px;text-align:center">V</div>
<h1 style="font-size:20px;margin:24px 0 8px">${title}</h1><p style="font-size:15px;line-height:1.5;color:#4a4857;margin:0">${text}</p></main></body></html>`;
