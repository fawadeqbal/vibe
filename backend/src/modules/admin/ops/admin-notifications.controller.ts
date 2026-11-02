import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

import { AppError } from '../../../common/errors/app-error';
import { CATALOG_BY_KEY } from '../../notifications/catalog';
import { NotificationsService } from '../../notifications/notifications.service';
import { P } from '../core/permissions';
import { Audit, CurrentStaff, RequirePermissions, StaffApi } from '../core/staff-api.decorator';
import type { StaffPrincipal } from '../core/staff.types';

class ChannelsDto {
  @IsOptional()
  @IsBoolean()
  push?: boolean;

  @IsOptional()
  @IsBoolean()
  inApp?: boolean;

  @IsOptional()
  @IsBoolean()
  email?: boolean;
}

/** Admin → Configuration → Notifications: every type, its channels, and how many went out. */
@StaffApi('settings')
@RequirePermissions(P.OpsSettings)
@Controller('admin/config/notifications')
export class AdminNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'All notification types with their channels and last-7-days counts' })
  get() {
    return this.notifications.adminView();
  }

  @Put(':type')
  @ApiOperation({ summary: 'Turn channels on/off for one notification type' })
  @Audit('notifications.channels_changed', { target: 'setting', summary: ({ params, body }) => `${String((params as { type?: string })?.type)}: ${JSON.stringify(body)}` })
  set(@CurrentStaff() me: StaffPrincipal, @Param('type') type: string, @Body() dto: ChannelsDto) {
    if (!CATALOG_BY_KEY.has(type)) throw AppError.notFound('Notification type');
    return this.notifications.setChannels(type, dto, me.id);
  }
}
