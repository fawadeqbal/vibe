import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { CampaignAudience, CampaignStatus, DeliveryStatus, Gender } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsISO8601, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

import { CursorQueryDto } from '../../../common/dto/pagination.dto';
import { CampaignsService, MAX_PICKED } from '../../messaging/campaigns.service';
import { CampaignWorker } from '../../messaging/campaign-worker.service';
import { P } from '../core/permissions';
import { Audit, CurrentStaff, RequirePermissions, StaffApi } from '../core/staff-api.decorator';
import type { StaffPrincipal } from '../core/staff.types';

class SegmentDto {
  @IsOptional()
  @IsBoolean()
  vip?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @Matches(/^[A-Z]{2}$/, { each: true })
  countries?: string[];

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  activeWithinDays?: number;

  @IsOptional()
  @IsISO8601()
  joinedAfter?: string;

  @IsOptional()
  @IsISO8601()
  joinedBefore?: string;
}

class AudienceDto {
  @IsEnum(CampaignAudience)
  audience!: CampaignAudience;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PICKED)
  @IsString({ each: true })
  userIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SegmentDto)
  segment?: SegmentDto;

  /** Count people who turned off e-mail updates too. */
  @IsOptional()
  @IsBoolean()
  important?: boolean;
}

class ContentDto {
  @IsString()
  @Length(1, 200)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  preheader?: string;

  @IsString()
  @MaxLength(200)
  heading!: string;

  @IsString()
  @Length(1, 5000)
  body!: string;

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

class PreviewDto extends ContentDto {
  /** Render for this person (their name/e-mail); a sample person otherwise. */
  @IsOptional()
  @IsString()
  userId?: string;
}

class CreateMessageDto extends ContentDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsBoolean()
  sendEmail!: boolean;

  @IsBoolean()
  sendInApp!: boolean;

  @IsOptional()
  @IsBoolean()
  important?: boolean;

  @IsEnum(CampaignAudience)
  audience!: CampaignAudience;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PICKED)
  @IsString({ each: true })
  userIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SegmentDto)
  segment?: SegmentDto;

  @IsOptional()
  @IsString()
  templateKey?: string;
}

class ListQuery extends CursorQueryDto {
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;
}

class DeliveriesQuery extends CursorQueryDto {
  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;
}

@StaffApi('messaging')
@RequirePermissions(P.OpsMessages)
@Controller('admin/messages')
export class AdminMessagesController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly worker: CampaignWorker,
  ) {}

  @Post('audience')
  @HttpCode(200)
  @ApiOperation({ summary: 'How many people a message would reach (and how many by e-mail)' })
  audience(@Body() dto: AudienceDto) {
    return this.campaigns.audience(dto, { important: dto.important });
  }

  @Post('preview')
  @HttpCode(200)
  preview(@Body() dto: PreviewDto) {
    const { userId, ...content } = dto;
    return this.campaigns.preview(content, userId);
  }

  @Post()
  @Audit('message.sent', {
    target: 'message',
    summary: ({ body, result }) => `${String(body.name)} → ${String(body.audience).toLowerCase()} (${(result as { total?: number })?.total ?? '?'} people) by ${[body.sendEmail && 'e-mail', body.sendInApp && 'in-app'].filter(Boolean).join(' + ')}`,
  })
  @ApiOperation({ summary: 'Queue a message; it sends in the background' })
  async create(@CurrentStaff() me: StaffPrincipal, @Body() dto: CreateMessageDto) {
    const c = await this.campaigns.create(me.id, dto);
    void this.worker.tick();
    return this.campaigns.get(c.id);
  }

  @Get()
  list(@Query() q: ListQuery) {
    return this.campaigns.list(q);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.campaigns.get(id);
  }

  @Get(':id/deliveries')
  deliveries(@Param('id') id: string, @Query() q: DeliveriesQuery) {
    return this.campaigns.deliveries(id, q);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Audit('message.canceled', { target: 'message' })
  cancel(@Param('id') id: string) {
    return this.campaigns.cancel(id);
  }
}
