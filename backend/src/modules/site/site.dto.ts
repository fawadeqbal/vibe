import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class AttributionDto {
  @ApiProperty({ description: 'The visit id the landing page put on the app link (?vid=)' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,40}$/)
  visitId!: string;
}
