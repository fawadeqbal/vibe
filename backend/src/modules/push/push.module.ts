import { Module } from '@nestjs/common';

import { PushBridge } from './push-bridge';
import { PushController } from './push.controller';
import { PushService } from './push.service';

/** Push notifications: device tokens, FCM sending, and which events notify (PushBridge). */
@Module({
  controllers: [PushController],
  providers: [PushService, PushBridge],
  exports: [PushService],
})
export class PushModule {}
