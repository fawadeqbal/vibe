import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';

import { COUNTRY_CODES } from '../../catalog/economy';

export class SaveFiltersDto {
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

  @ApiPropertyOptional({ description: 'ISO country code, or null for anywhere', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(COUNTRY_CODES)
  countryCode?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  verifiedOnly?: boolean;
}
