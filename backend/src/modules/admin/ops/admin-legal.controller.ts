import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { LegalService } from '../../legal/legal.service';
import { P } from '../core/permissions';
import { Audit, CurrentStaff, RequirePermissions, StaffApi } from '../core/staff-api.decorator';
import type { StaffPrincipal } from '../core/staff.types';

class LegalEditDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(300)
  summary!: string;

  @IsString()
  @MinLength(20)
  @MaxLength(100_000)
  markdown!: string;
}

class LegalPreviewDto {
  @IsString()
  @MaxLength(100_000)
  markdown!: string;
}

/** Admin → Legal pages: Terms, Privacy, Community Guidelines, Child Safety. */
@StaffApi('settings')
@RequirePermissions(P.OpsSettings)
@Controller('admin/legal')
export class AdminLegalController {
  constructor(private readonly legal: LegalService) {}

  @Get()
  @ApiOperation({ summary: 'Every legal page with its text and version' })
  list() {
    return this.legal.list();
  }

  @Post('preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'Markdown → the HTML the website will show' })
  preview(@Body() dto: LegalPreviewDto) {
    return this.legal.preview(dto.markdown);
  }

  @Put(':slug')
  @ApiOperation({ summary: 'Save a page (bumps its version)' })
  @Audit('legal.updated', { target: 'legal', param: 'slug', omitBody: true, summary: ({ params, result }) => `${params.slug} → v${(result as { version?: number }).version ?? '?'}` })
  save(@CurrentStaff() me: StaffPrincipal, @Param('slug') slug: string, @Body() dto: LegalEditDto) {
    return this.legal.save(slug, dto, me.id);
  }

  @Post(':slug/reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Put back the text Vibe shipped with' })
  @Audit('legal.reset', { target: 'legal', param: 'slug' })
  reset(@CurrentStaff() me: StaffPrincipal, @Param('slug') slug: string) {
    return this.legal.reset(slug, me.id);
  }
}
