import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppealsService } from './appeals.service';
import { CreateAppealDto } from './dto/appeal.dto';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me/appeal')
export class AppealsController {
  constructor(private readonly appeals: AppealsService) {}

  @Get()
  @ApiOperation({ summary: 'Your appeal for the current pause, or null' })
  async mine(@CurrentUser('id') me: string) {
    return { appeal: await this.appeals.mine(me) };
  }

  @Post()
  @ApiOperation({ summary: '"Think this is a mistake?" — one appeal per pause; a moderator answers (account:appeal)' })
  async create(@CurrentUser('id') me: string, @Body() dto: CreateAppealDto) {
    return { appeal: await this.appeals.create(me, dto.message) };
  }
}
