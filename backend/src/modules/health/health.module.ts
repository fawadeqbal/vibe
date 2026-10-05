import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { StatsController } from './stats.controller';

@Module({ controllers: [HealthController, StatsController] })
export class HealthModule {}
