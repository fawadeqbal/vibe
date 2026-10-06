import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Length, Max, Min } from 'class-validator';

import { COUNTRY_CODES, INTERESTS } from '../../catalog/economy';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Sana' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 40)
  name?: string;

  @ApiPropertyOptional({ example: 23, description: 'Under-18 is rejected' })
  @IsOptional()
  @IsInt()
  @Min(13)
  @Max(99)
  age?: number;

  @ApiPropertyOptional({ enum: ['male', 'female', 'other'] })
  @IsOptional()
  @IsIn(['male', 'female', 'other'])
  gender?: 'male' | 'female' | 'other';

  @ApiPropertyOptional({ example: 'PK' })
  @IsOptional()
  @IsIn(COUNTRY_CODES)
  countryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 120)
  bio?: string;

  @ApiPropertyOptional({ type: [String], example: ['Music', 'Travel', 'Coffee'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsIn(INTERESTS, { each: true })
  interests?: string[];

  @ApiPropertyOptional({ description: 'Get newsletters and announcements by e-mail' })
  @IsOptional()
  @IsBoolean()
  marketingEmails?: boolean;

  @ApiPropertyOptional({ description: 'Use POST /me/avatar to upload; a URL is accepted for imports' })
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  avatarUrl?: string;

  @ApiPropertyOptional({ description: 'New followers need your approval' })
  @IsOptional()
  @IsBoolean()
  privateAccount?: boolean;

  @ApiPropertyOptional({ description: 'Hide matches, likes and gifts on your profile' })
  @IsOptional()
  @IsBoolean()
  hideStats?: boolean;

  @ApiPropertyOptional({ nullable: true, example: 5000, description: 'Gems you are saving towards (100–10,000,000); null clears it' })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(10_000_000)
  gemGoal?: number | null;

  @ApiPropertyOptional({ nullable: true, example: 1320, description: 'Quiet hours start, minutes after midnight in tzOffsetMinutes (null = off)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  quietHoursStart?: number | null;

  @ApiPropertyOptional({ nullable: true, example: 420, description: 'Quiet hours end, minutes after midnight (null = off)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  quietHoursEnd?: number | null;

  @ApiPropertyOptional({ example: 300, description: "The device's UTC offset in minutes (Pakistan = 300)" })
  @IsOptional()
  @IsInt()
  @Min(-720)
  @Max(840)
  tzOffsetMinutes?: number;

  @ApiPropertyOptional({ nullable: true, enum: [30, 60, 90, 120], description: 'Break reminder after this many minutes in a call; null = off' })
  @IsOptional()
  @IsIn([30, 60, 90, 120])
  breakReminderMinutes?: number | null;
}
