import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ example: 'hey!' })
  @IsString()
  @Length(1, 1000)
  text!: string;

  @ApiPropertyOptional({ description: 'The message this one replies to' })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  replyToId?: string;
}

export class SendMediaDto {
  @ApiProperty({ enum: ['photo', 'voice'] })
  @IsIn(['photo', 'voice'])
  kind!: 'photo' | 'voice';

  @ApiPropertyOptional({ description: 'Voice notes: length in seconds' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(600)
  seconds?: number;

  @ApiPropertyOptional({ description: 'Photos: width and height in pixels' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20000)
  w?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20000)
  h?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 40)
  replyToId?: string;
}

export class ReactDto {
  @ApiPropertyOptional({ example: '❤️', description: 'One emoji; null or empty removes your reaction' })
  @IsOptional()
  @IsString()
  @Length(0, 16)
  emoji?: string | null;
}

export class SendGiftDto {
  @ApiProperty({ example: 'rose' })
  @IsString()
  @Length(1, 40)
  giftId!: string;
}
