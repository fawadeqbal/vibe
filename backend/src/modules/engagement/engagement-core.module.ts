import { Global, Module } from '@nestjs/common';

import { EngagementService } from './engagement.service';
import { ProgressService } from './progress.service';

/**
 * Vibe Hour and XP. Global like the catalog: matching, wallet, rewards and
 * social all award XP or check Vibe Hour, and these depend on nothing but
 * infrastructure, so there is no cycle.
 */
@Global()
@Module({ providers: [EngagementService, ProgressService], exports: [EngagementService, ProgressService] })
export class EngagementCoreModule {}
