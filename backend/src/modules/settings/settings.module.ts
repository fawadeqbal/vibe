import { Global, Module } from '@nestjs/common';

import { MaintenanceGuard } from './maintenance.guard';
import { SettingsService } from './settings.service';

@Global()
@Module({ providers: [SettingsService, MaintenanceGuard], exports: [SettingsService, MaintenanceGuard] })
export class SettingsModule {}
