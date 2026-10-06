import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsIn, IsInt, IsOptional, IsString, IsUrl, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class PreviewQuery {
  @ApiPropertyOptional({ description: "The link's `s=` channel" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  s?: string;
}

export class ClaimDto {
  @ApiProperty({ example: 'K7P2QXM' })
  @trim()
  @IsString()
  @Matches(/^[A-Za-z0-9_]{3,20}$/, { message: 'Codes are 3–20 letters, digits or _' })
  code!: string;
}

export const PLATFORMS = ['tiktok', 'youtube', 'instagram', 'facebook', 'x', 'snapchat', 'twitch', 'other'] as const;

export class ChannelDto {
  @ApiProperty({ enum: PLATFORMS })
  @IsIn(PLATFORMS)
  platform!: (typeof PLATFORMS)[number];

  @ApiProperty({ example: 'https://www.tiktok.com/@ali' })
  @trim()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'Enter the full link to your profile (https://…)' })
  @MaxLength(300)
  url!: string;

  @ApiProperty({ example: 25000 })
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  followers!: number;
}

export class ApplyDto {
  @ApiProperty({ example: 'Ali Vlogs' })
  @trim()
  @IsString()
  @Length(2, 40)
  displayName!: string;

  @ApiProperty({ example: 'ALI', description: '3–20 letters, digits or _; stored upper-case' })
  @trim()
  @IsString()
  @Matches(/^[A-Za-z0-9_]{3,20}$/, { message: 'Codes are 3–20 letters, digits or _' })
  code!: string;

  @ApiProperty({ type: [ChannelDto] })
  @ValidateNested({ each: true })
  @Type(() => ChannelDto)
  @ArrayMinSize(1, { message: 'Add at least one channel' })
  @ArrayMaxSize(5, { message: 'At most 5 channels' })
  channels!: ChannelDto[];

  @ApiPropertyOptional({ description: 'Anything we should know (≤ 1000 characters)' })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CodeQuery {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  code!: string;
}

export class StatsQuery {
  @ApiPropertyOptional({ enum: [7, 30, 90], default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsIn([7, 30, 90])
  days: number = 30;
}

export class PayoutRequestDto {
  @ApiProperty({ description: 'A saved payout account (GET /wallet/payout-accounts)' })
  @IsString()
  @Length(1, 64)
  payoutAccountId!: string;
}
