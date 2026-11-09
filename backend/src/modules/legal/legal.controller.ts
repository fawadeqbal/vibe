import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator';
import { SkipMaintenance } from '../settings/maintenance.guard';
import { LegalService } from './legal.service';

/** The legal pages, for the website and the apps (no sign-in needed). */
@ApiTags('app')
@Public()
@SkipMaintenance()
@Controller('legal')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Get()
  @ApiOperation({ summary: 'All legal pages: slug, title, summary, version, last change' })
  async list() {
    return (await this.legal.list()).map(({ slug, title, summary, version, updatedAt, url }) => ({ slug, title, summary, version, updatedAt, url }));
  }

  @Get(':slug')
  @ApiOperation({ summary: 'One legal page (terms | privacy | guidelines | child-safety) with safe HTML' })
  get(@Param('slug') slug: string) {
    return this.legal.get(slug);
  }
}
