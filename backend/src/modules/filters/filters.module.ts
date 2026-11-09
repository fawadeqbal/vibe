import { Module } from '@nestjs/common';

import { WalletModule } from '../wallet/wallet.module';
import { FiltersController } from './filters.controller';
import { FiltersService } from './filters.service';

/** The filters random matches and Discover share, and the one filter pass. */
@Module({
  imports: [WalletModule],
  controllers: [FiltersController],
  providers: [FiltersService],
  exports: [FiltersService],
})
export class FiltersModule {}
