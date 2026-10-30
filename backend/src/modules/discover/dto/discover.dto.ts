import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

const bool = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

export class DeckQueryDto {
  @ApiPropertyOptional({ enum: ['anyone', 'women', 'men'] })
  @IsOptional()
  @IsIn(['anyone', 'women', 'men'])
  gender?: 'anyone' | 'women' | 'men';

  @ApiPropertyOptional({ minimum: 18, maximum: 99 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(18)
  @Max(99)
  minAge?: number;

  @ApiPropertyOptional({ minimum: 18, maximum: 99 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(18)
  @Max(99)
  maxAge?: number;

  @ApiPropertyOptional({ description: 'Two-letter country code; empty = anywhere' })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;

  @ApiPropertyOptional({ description: 'Only people online right now' })
  @IsOptional()
  @Transform(bool)
  @IsBoolean()
  onlineOnly?: boolean;

  @ApiPropertyOptional({ description: 'Only selfie-verified people' })
  @IsOptional()
  @Transform(bool)
  @IsBoolean()
  verifiedOnly?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class SwipeDto {
  @ApiProperty()
  @IsString()
  @Length(1, 40)
  userId!: string;

  @ApiProperty({ enum: ['like', 'super', 'pass'] })
  @IsIn(['like', 'super', 'pass'])
  kind!: 'like' | 'super' | 'pass';
}

export class VisibilityDto {
  @ApiProperty()
  @IsBoolean()
  visible!: boolean;
}

export class NotifyNewDto {
  @IsBoolean()
  on!: boolean;
}
