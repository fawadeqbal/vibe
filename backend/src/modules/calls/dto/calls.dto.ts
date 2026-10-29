import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class CallConsentDto {
  @ApiProperty({
    description: 'true: allow video calls (asks them if they have not yet). false: turn calls off for both.',
  })
  @IsBoolean()
  allow!: boolean;
}

export class DeclineCallDto {
  @ApiPropertyOptional({ example: "Can't talk now", description: 'A quick reply, sent as a chat message' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  reply?: string;
}
