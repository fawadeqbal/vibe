import { Global, Module } from '@nestjs/common';

import { CatalogController } from './catalog.controller';
import { EconomyService } from './economy.service';

/** Prices and rules. Global: charges and rewards everywhere read the live values. */
@Global()
@Module({ controllers: [CatalogController], providers: [EconomyService], exports: [EconomyService] })
export class CatalogModule {}
