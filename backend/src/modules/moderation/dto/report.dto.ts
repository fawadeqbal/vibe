import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportReason } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, Length } from 'class-validator';

export class CreateReportDto {
  @ApiProperty()
  @IsString()
  userId!: string;

  @ApiProperty({ enum: ReportReason })
  @IsEnum(ReportReason)
  reason!: ReportReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  matchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  block?: boolean = true;
}
