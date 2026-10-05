import { Body, Controller, Delete, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PushService } from './push.service';

class PushTokenDto {
  @ApiProperty({ description: 'FCM registration token from firebase_messaging' })
  @IsString()
  @Length(20, 4096)
  token!: string;

  @ApiProperty({ enum: ['android', 'ios', 'web'] })
  @IsIn(['android', 'ios', 'web'])
  platform!: 'android' | 'ios' | 'web';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 32)
  appVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 16)
  locale?: string;
}

@ApiTags('push')
@ApiBearerAuth()
@Controller('me/push-tokens')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Register this device for notifications (call after sign-in and when FCM refreshes the token)' })
  async register(@CurrentUser('id') userId: string, @Body() dto: PushTokenDto) {
    await this.push.register(userId, dto);
    return { ok: true, mode: this.push.mode };
  }

  @Delete(':token')
  @ApiOperation({ summary: 'Stop notifications on this device (sign-out)' })
  async unregister(@CurrentUser('id') userId: string, @Param('token') token: string) {
    await this.push.unregister(userId, token);
    return { ok: true };
  }
}
