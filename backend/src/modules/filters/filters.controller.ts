import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SaveFiltersDto } from './dto/filters.dto';
import { FiltersService } from './filters.service';

@ApiTags('filters')
@ApiBearerAuth()
@Controller('filters')
export class FiltersController {
  constructor(private readonly filters: FiltersService) {}

  @Get()
  @ApiOperation({ summary: 'Your filters (random matches and Discover share them) and whether the extra ones are open' })
  get(@CurrentUser('id') me: string) {
    return this.filters.view(me);
  }

  @Put()
  @ApiOperation({ summary: 'Save your filters: gender, age range, country (null = anywhere), verified only' })
  save(@CurrentUser('id') me: string, @Body() dto: SaveFiltersDto) {
    return this.filters.save(me, dto);
  }

  @Post('pass')
  @HttpCode(200)
  @ApiOperation({ summary: 'Buy the filter pass: gender, country and verified filters in matches and Discover, for coins (free for VIP and in Vibe Hour)' })
  pass(@CurrentUser('id') me: string) {
    return this.filters.buyPass(me);
  }
}
