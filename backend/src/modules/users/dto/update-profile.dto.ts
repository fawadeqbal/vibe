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
}
