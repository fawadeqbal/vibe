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
  @ApiProperty({ enum: ['ask', 'yes', 'no', 'off'], description: 'Ask to turn on video in a voice call, answer the ask, or switch a video call to voice only ("off", either side, no ask)' })
  @IsIn(['ask', 'yes', 'no', 'off'])
  action!: 'ask' | 'yes' | 'no' | 'off';
}

export class AcceptCallDto {
  @ApiPropertyOptional({ enum: ['voice', 'video'], description: '"voice": pick up a video call as voice only (both cameras stay off)' })
  @IsOptional()
  @IsIn(['voice', 'video'])
  media?: 'voice' | 'video';

  @ApiPropertyOptional({ description: 'Which of your devices picked up; your other devices close ("Answered on your other device")' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  deviceId?: string;
}

export class DeclineCallDto {
  @ApiPropertyOptional({ example: "Can't talk now", description: 'A quick reply, sent as a chat message' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  reply?: string;
}
