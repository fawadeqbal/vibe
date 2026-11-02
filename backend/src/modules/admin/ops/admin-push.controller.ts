import { Body, Controller, Delete, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { AppError } from '../../../common/errors/app-error';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { PushSettingsService } from '../../push/push-settings.service';
import { PushService } from '../../push/push.service';
import { P } from '../core/permissions';
import { Audit, CurrentStaff, RequirePermissions, StaffApi } from '../core/staff-api.decorator';
import type { StaffPrincipal } from '../core/staff.types';

class PushKeyDto {
  /** The service-account JSON from Firebase. Write-only: never returned. */
  @IsString()
  @MinLength(2)
  @MaxLength(10_000)
  serviceAccountJson!: string;
}

class PushTestDto {
  /** The app user to notify: their e-mail or user id. */
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  user!: string;
}

/**
 * Admin → Configuration → Push notifications. The Firebase key goes in,
 * is checked with Google, stored encrypted, and never comes back out.
 */
@StaffApi('settings')
@RequirePermissions(P.OpsSettings)
@Controller('admin/config/push')
export class AdminPushController {
  constructor(
    private readonly settings: PushSettingsService,
    private readonly push: PushService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Push settings (without the key), whether sending is on, and registered devices' })
  async get() {
    await this.push.refresh();
    return { ...(await this.settings.view()), mode: this.push.mode };
  }

  @Put()
  @ApiOperation({ summary: 'Save the Firebase service-account key: checked with Google first (PUSH_KEY_INVALID if refused)' })
  @Audit('push.key_changed', { target: 'setting', omitBody: true, summary: ({ result }) => `project ${String((result as { projectId?: string })?.projectId ?? '')}` })
  async save(@CurrentStaff() me: StaffPrincipal, @Body() dto: PushKeyDto) {
    const view = await this.settings.save(dto.serviceAccountJson, me.id);
    await this.push.refresh();
    return { ...view, mode: this.push.mode };
  }

  @Delete()
  @ApiOperation({ summary: 'Remove the saved key (push stops unless the server file sets one)' })
  @Audit('push.key_removed', { target: 'setting', omitBody: true })
  async remove() {
    const view = await this.settings.remove();
    await this.push.refresh();
    return { ...view, mode: this.push.mode };
  }

  @Post('test')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a test notification to every device of one app user (by e-mail or id)' })
  @Audit('push.tested', { target: 'user', summary: ({ body }) => String(body.user) })
  async test(@Body() dto: PushTestDto) {
    const q = dto.user.trim();
    const user = await this.prisma.user.findFirst({ where: q.includes('@') ? { email: q.toLowerCase() } : { id: q }, select: { id: true, name: true, email: true } });
    if (!user) throw AppError.notFound('User');
    return { user: { id: user.id, name: user.name }, ...(await this.push.sendTest(user.id)), mode: this.push.mode };
  }
}
