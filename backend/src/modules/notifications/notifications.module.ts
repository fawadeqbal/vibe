import { Global, Module } from '@nestjs/common';

import { PushModule } from '../push/push.module';
import { ActivityFeedService } from './activity-feed.service';
import { ActivityController } from './activity.controller';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/** Every notification (push, in-app inbox, e-mail) goes out through NotificationsService. See catalog.ts. */
@Global()
@Module({
  imports: [PushModule],
  controllers: [NotificationsController, ActivityController],
  providers: [NotificationsService, ActivityFeedService],
  exports: [NotificationsService, ActivityFeedService],
})
export class NotificationsModule {}
