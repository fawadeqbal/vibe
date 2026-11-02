import { Module } from '@nestjs/common';

import { PushController } from './push.controller';
import { PushSettingsService } from './push-settings.service';
import { PushService } from './push.service';

/** Push: device tokens and FCM sending. What gets sent lives in NotificationsModule. */
@Module({
  controllers: [PushController],
  providers: [PushService, PushSettingsService],
  exports: [PushService, PushSettingsService],
})
export class PushModule {}
