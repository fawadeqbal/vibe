import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateReportDto } from './dto/report.dto';
import { ModerationService } from './moderation.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly moderation: ModerationService) {}

  @Post()
  @ApiOperation({ summary: 'Report someone (blocks them too unless block=false)' })
  report(@CurrentUser('id') me: string, @Body() dto: CreateReportDto) {
    return this.moderation.report(me, dto);
  }
}
