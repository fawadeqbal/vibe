import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { AppDownloadService } from '../../site/app-download.service';
import { P } from '../core/permissions';
import { Audit, CurrentStaff, RequirePermissions, StaffApi } from '../core/staff-api.decorator';
import type { StaffPrincipal } from '../core/staff.types';

class DownloadLinkDto {
  /** https link to the .apk. Empty or missing = back to the latest GitHub release. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  androidUrl?: string;
}

/** Admin → Configuration → Android app download: where every "Download for Android" button leads. */
@StaffApi('settings')
@RequirePermissions(P.OpsSettings)
@Controller('admin/config/download')
export class AdminDownloadController {
  constructor(private readonly downloads: AppDownloadService) {}

  @Get()
  @ApiOperation({ summary: 'The Android download link in use, the default, and download counts' })
  get() {
    return this.downloads.view();
  }

  @Put()
  @ApiOperation({ summary: 'Change the Android download link (checked: it must download an APK). Empty = latest GitHub release' })
  @Audit('download.link_changed', { target: 'setting', summary: ({ body }) => String(body.androidUrl || 'latest GitHub release') })
  set(@CurrentStaff() me: StaffPrincipal, @Body() dto: DownloadLinkDto) {
    return this.downloads.set(dto.androidUrl?.trim() ? dto.androidUrl : null, me.id);
  }
}
