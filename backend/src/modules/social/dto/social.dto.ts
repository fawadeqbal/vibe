import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ example: 'hey!' })
  @IsString()
  @Length(1, 1000)
  text!: string;
}

export class SendGiftDto {
  @ApiProperty({ example: 'rose' })
  @IsString()
  @Length(1, 40)
  giftId!: string;
}
