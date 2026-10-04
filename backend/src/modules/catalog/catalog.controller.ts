import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator';
import { EconomyService } from './economy.service';

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly economy: EconomyService) {}

  @Public()
  @Get()
  // Short: staff can change prices at any time (apps also get a live `catalog:updated`).
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Prices, packs, plans, gifts and rules — the app renders the store from this' })
  get() {
    return this.economy.catalog();
  }
}
