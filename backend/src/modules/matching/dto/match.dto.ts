import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReportReason } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, Length } from 'class-validator';

import { COUNTRY_CODES } from '../../catalog/economy';

export class JoinDto {
  @ApiPropertyOptional({ enum: ['ANYONE', 'WOMEN', 'MEN'], default: 'ANYONE' })
  @IsOptional()
  @IsIn(['ANYONE', 'WOMEN', 'MEN'])
  gender: 'ANYONE' | 'WOMEN' | 'MEN' = 'ANYONE';

  @IsOptional()
  @IsIn(COUNTRY_CODES)
  countryCode?: string | null;

  @IsOptional()
  @IsBoolean()
  safeMode: boolean = false;

  @IsOptional()
  @IsBoolean()
  autoBlur: boolean = true;
}

export class NextDto {
  @IsOptional()
  @IsBoolean()
  payToBypass: boolean = false;
}

export class ChatDto {
  @IsString()
  @Length(1, 500)
  text!: string;
}

export class GiftDto {
  @IsString()
  @Length(1, 40)
  giftId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  idempotencyKey?: string;
}

export class MatchReportDto {
  @IsEnum(ReportReason)
  reason!: ReportReason;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;

  @IsOptional()
  @IsBoolean()
  block: boolean = true;
}

export class SignalDto {
  @IsIn(['offer', 'answer', 'ice', 'hangup'])
  type!: 'offer' | 'answer' | 'ice' | 'hangup';

  /** SDP or ICE candidate — opaque to the server. */
  @IsOptional()
  data?: unknown;
}
