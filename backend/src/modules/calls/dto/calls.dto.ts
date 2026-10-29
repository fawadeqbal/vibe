import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';

export class CallConsentDto {
  @ApiProperty({
    description: 'true: allow video calls (asks them if they have not yet). false: turn calls off for both.',
  })
  @IsBoolean()
  allow!: boolean;

  @ApiPropertyOptional({ description: 'With allow: also allow video (default true). false = voice calls only.' })
  @IsOptional()
  @IsBoolean()
  video?: boolean;
}

export class RingDto {
  @ApiPropertyOptional({ enum: ['voice', 'video'], default: 'video' })
  @IsOptional()
  @IsIn(['voice', 'video'])
  media?: 'voice' | 'video';
}

export class CallVideoDto {
  @ApiProperty({ enum: ['ask', 'yes', 'no'], description: 'Ask to turn on video in a voice call, or answer the ask' })
  @IsIn(['ask', 'yes', 'no'])
  action!: 'ask' | 'yes' | 'no';
}

export class DeclineCallDto {
  @ApiPropertyOptional({ example: "Can't talk now", description: 'A quick reply, sent as a chat message' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  reply?: string;
}
