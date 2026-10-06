import { Body, Controller, Delete, Get, HttpCode, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OK } from '../../common/dto/ok.dto';
import { CreateMomentDto, ReportMomentDto } from './moments.dto';
import { MomentsService } from './moments.service';

/** Same limit as avatar uploads. */
const MAX_IMAGE = 5 * 1024 * 1024;

@ApiTags('moments')
@ApiBearerAuth()
@Controller('moments')
export class MomentsController {
  constructor(private readonly moments: MomentsService) {}

  @Post()
  @ApiOperation({ summary: 'Post a 24-hour photo: multipart `photo` (JPEG/PNG/WebP, 5 MB) + optional `caption` (120). 429 MOMENT_LIMIT at 10 live' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { photo: { type: 'string', format: 'binary' }, caption: { type: 'string' } } } })
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_IMAGE, files: 1 } }))
  create(@CurrentUser('id') me: string, @Body() dto: CreateMomentDto, @UploadedFile() photo?: Express.Multer.File) {
    return this.moments.create(me, photo, dto.caption);
  }

  @Get('feed')
  @ApiOperation({ summary: 'Your live moments, and those of people you follow and your friends (unseen first)' })
  feed(@CurrentUser('id') me: string) {
    return this.moments.feed(me);
  }

  @Post(':id/view')
  @HttpCode(200)
  view(@CurrentUser('id') me: string, @Param('id') id: string) {
    return this.moments.view(me, id);
  }

  @Get(':id/viewers')
  @ApiOperation({ summary: 'Who saw your moment (own moments only)' })
  viewers(@CurrentUser('id') me: string, @Param('id') id: string) {
    return this.moments.viewers(me, id);
  }

  @Delete(':id')
  async remove(@CurrentUser('id') me: string, @Param('id') id: string) {
    await this.moments.remove(me, id);
    return OK;
  }

  @Post(':id/report')
  @HttpCode(200)
  report(@CurrentUser('id') me: string, @Param('id') id: string, @Body() dto: ReportMomentDto) {
    return this.moments.report(me, id, dto);
  }
}
