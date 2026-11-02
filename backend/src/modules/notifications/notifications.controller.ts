import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Channel, CHANNELS, GROUPS, NotifyGroup } from './catalog';
import { NotificationsService } from './notifications.service';

class NotifyPrefDto {
  @ApiProperty({ enum: GROUPS.map((g) => g.key) })
  @IsIn(GROUPS.map((g) => g.key))
  group!: NotifyGroup;

  @ApiProperty({ enum: CHANNELS })
  @IsIn(CHANNELS)
  channel!: Channel;

  @ApiProperty()
  @IsBoolean()
  on!: boolean;
}

/** Me → Notifications: which groups reach you, and how (phone, inbox, e-mail). */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Your notification choices per group and channel' })
  get(@CurrentUser('id') me: string) {
    return this.notifications.prefsView(me);
  }

  @Put()
  @ApiOperation({ summary: 'Turn one channel of one group on or off (account alerts always stay on)' })
  set(@CurrentUser('id') me: string, @Body() dto: NotifyPrefDto) {
    return this.notifications.setPref(me, dto.group, dto.channel, dto.on);
  }
}
