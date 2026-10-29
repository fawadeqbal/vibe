import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { WavesService } from './waves.service';

@ApiTags('waves')
@ApiBearerAuth()
@Controller('waves')
export class WavesController {
  constructor(private readonly waves: WavesService) {}

  @Get('recent')
  @ApiOperation({ summary: '"Recently here": up to 30 real people seen in the last 2 days, people who waved at you first' })
  recent(@CurrentUser('id') me: string) {
    return this.waves.recent(me);
  }

  @Get('received')
  @ApiOperation({ summary: 'Waves you got in the last 7 days, newest first, with how many are unseen' })
  received(@CurrentUser('id') me: string) {
    return this.waves.received(me);
  }

  @Post('seen')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark received waves as seen' })
  async seen(@CurrentUser('id') me: string) {
    await this.waves.markSeen(me);
    return { unseen: 0 };
  }

  @Post(':userId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Wave at someone (20 a day). They hear about it in the app, by push, or by e-mail without the app; you are matched first when both search.' })
  wave(@CurrentUser('id') me: string, @Param('userId') userId: string) {
    return this.waves.wave(me, userId);
  }
}
