import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

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
