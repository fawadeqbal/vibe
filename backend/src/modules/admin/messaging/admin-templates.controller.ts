import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, Length, MaxLength } from 'class-validator';

import { OK } from '../../../common/dto/ok.dto';
import { MailProvider } from '../../../infra/mail/mail.provider';
import { MailTemplatesService } from '../../messaging/mail-templates.service';
import { P } from '../core/permissions';
import { Audit, CurrentStaff, RequirePermissions, StaffApi } from '../core/staff-api.decorator';
import type { StaffPrincipal } from '../core/staff.types';

export class MailFieldsDto {
  @IsString()
  @MaxLength(200)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  preheader?: string;

  @IsString()
  @MaxLength(200)
  heading!: string;

  @IsString()
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  highlight?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  buttonLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  buttonUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  footer?: string;
}

class UpdateTemplateDto extends MailFieldsDto {
  /** Custom templates only. */
  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

class CreateTemplateDto {
  @IsString()
  @Length(2, 80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  /** Copy wording from this template. */
  @IsOptional()
  @IsString()
  from?: string;
}

class PreviewDto {
  @IsObject()
  fields!: MailFieldsDto;

  /** Show the "Stop e-mail updates" link (message e-mails). */
  @IsOptional()
  @IsBoolean()
  unsubscribe?: boolean;
}

class TestDto {
  /** Send the unsaved version being edited; otherwise the saved one. */
  @IsOptional()
  @IsObject()
  fields?: MailFieldsDto;
}

@StaffApi('messaging')
@Controller('admin/mail-templates')
export class AdminTemplatesController {
  constructor(
    private readonly templates: MailTemplatesService,
    private readonly mail: MailProvider,
  ) {}

  @Get()
  @RequirePermissions(P.OpsTemplates)
  list() {
    return this.templates.list();
  }

  /** Starting points for the message composer (needs only "Send messages"). */
  @Get('starters')
  @RequirePermissions(P.OpsMessages)
  async starters() {
    return (await this.templates.list()).filter((t) => t.usage === 'starter');
  }

  @Post('preview')
  @HttpCode(200)
  @RequirePermissions(P.OpsTemplates)
  @ApiOperation({ summary: 'Render unsaved fields with sample data (what the editor shows)' })
  preview(@Body() dto: PreviewDto) {
    return this.templates.preview(dto.fields, {}, { unsubscribeUrl: dto.unsubscribe ? 'https://vibe.app/unsubscribe' : undefined });
  }

  @Get(':key')
  @RequirePermissions(P.OpsTemplates)
  get(@Param('key') key: string) {
    return this.templates.get(key);
  }

  @Post()
  @RequirePermissions(P.OpsTemplates)
  @Audit('template.created', { target: 'template', summary: ({ body }) => String(body.name) })
  async create(@CurrentStaff() me: StaffPrincipal, @Body() dto: CreateTemplateDto) {
    const from = dto.from ? await this.templates.get(dto.from) : undefined;
    return this.templates.create({ ...(from ?? {}), name: dto.name, description: dto.description }, me.id);
  }

  @Put(':key')
  @RequirePermissions(P.OpsTemplates)
  @Audit('template.updated', { target: 'template', param: 'key', summary: ({ body }) => `Subject: ${String(body.subject)}` })
  update(@CurrentStaff() me: StaffPrincipal, @Param('key') key: string, @Body() dto: UpdateTemplateDto) {
    const { name, description, ...fields } = dto;
    return this.templates.update(key, fields, { name, description }, me.id);
  }

  @Post(':key/reset')
  @HttpCode(200)
  @RequirePermissions(P.OpsTemplates)
  @Audit('template.reset', { target: 'template', param: 'key' })
  reset(@Param('key') key: string) {
    return this.templates.reset(key);
  }

  @Delete(':key')
  @RequirePermissions(P.OpsTemplates)
  @Audit('template.deleted', { target: 'template', param: 'key' })
  async remove(@Param('key') key: string) {
    await this.templates.remove(key);
    return OK;
  }

  @Post(':key/test')
  @HttpCode(200)
  @RequirePermissions(P.OpsTemplates)
  @Audit('template.test_sent', { target: 'template', param: 'key', omitBody: true })
  @ApiOperation({ summary: 'Send it to yourself with sample data (only to your own staff e-mail)' })
  async test(@CurrentStaff() me: StaffPrincipal, @Param('key') key: string, @Body() dto: TestDto) {
    const t = await this.templates.get(key);
    const vars = { ...this.templates.sampleVars(t), email: me.email, name: me.name.split(' ')[0] };
    const m = this.templates.preview(dto.fields ?? t, vars, { unsubscribeUrl: t.usage === 'starter' ? 'https://vibe.app/unsubscribe' : undefined });
    await this.mail.send({ to: me.email, subject: `[Test] ${m.subject}`, html: m.html, text: m.text });
    return { sentTo: me.email };
  }
}
