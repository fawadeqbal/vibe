import { Global, Module } from '@nestjs/common';

import { PushModule } from '../push/push.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/** Every notification (push, in-app inbox, e-mail) goes out through NotificationsService. See catalog.ts. */
@Global()
@Module({
  imports: [PushModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
