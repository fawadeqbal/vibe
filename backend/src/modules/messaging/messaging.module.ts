import { Module } from '@nestjs/common';

import { CampaignWorker } from './campaign-worker.service';
import { CampaignsService } from './campaigns.service';
import { InboxController, UnsubscribeController } from './inbox.controller';

/** Messages from staff to users (e-mail + in-app inbox). Templates live in MailTemplatesModule. */
@Module({
  controllers: [InboxController, UnsubscribeController],
  providers: [CampaignsService, CampaignWorker],
  exports: [CampaignsService, CampaignWorker],
})
export class MessagingModule {}
