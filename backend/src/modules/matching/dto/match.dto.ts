import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReportReason } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

import { COUNTRY_CODES } from '../../catalog/economy';
import { GAME_IDS, GameId } from '../icebreakers';

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

  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(99)
  minAge?: number;

  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(99)
  maxAge?: number;
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

export class MediaDto {
  @IsBoolean()
  camOn!: boolean;

  @IsBoolean()
  micOn!: boolean;

  /** "Blur me": they see you blurred (their app blurs your video). */
  @IsOptional()
  @IsBoolean()
  blur?: boolean;

  /** The camera is on but video is paused because the connection is too weak (voice only for now). */
  @IsOptional()
  @IsBoolean()
  weak?: boolean;
}

export class ResumeDto {
  /** The call the app is still showing (from match:resumed). */
  @IsString()
  @Length(1, 64)
  matchId!: string;
}

export class SignalDto {
  /** `restart`: the callee lost the connection and asks the caller for a fresh offer (ICE restart). */
  @IsIn(['offer', 'answer', 'ice', 'hangup', 'restart'])
  type!: 'offer' | 'answer' | 'ice' | 'hangup' | 'restart';

  /** SDP or ICE candidate — opaque to the server. */
  @IsOptional()
  data?: unknown;
}

export class GameDto {
  @IsIn(['start', 'next', 'answer', 'close'])
  action!: 'start' | 'next' | 'answer' | 'close';

  /** Required for `start`. */
  @IsOptional()
  @IsIn(GAME_IDS)
  game?: GameId;

  /** `answer` on a two-option prompt: 0 or 1. */
  @IsOptional()
  @IsIn([0, 1])
  choice?: 0 | 1;

  /** `answer`: the round being answered (stale answers are refused). */
  @IsOptional()
  @IsInt()
  @Min(1)
  round?: number;
}
