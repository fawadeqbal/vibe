import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReportReason } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Multipart sends booleans as text. */
const bool = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);

export class CreateMomentDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 120)
  caption?: string;
}

export class ReportMomentDto {
  @IsEnum(ReportReason)
  reason!: ReportReason;

  @IsOptional()
  @IsString()
  @Length(0, 400)
  note?: string;

  @ApiPropertyOptional({ default: true, description: 'Also block the author (like POST /reports)' })
  @IsOptional()
  @Transform(bool)
  @IsBoolean()
  block?: boolean = true;
}
