import { Body, Controller, Delete, Get, HttpCode, Param, ParseFilePipeBuilder, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CursorQueryDto } from '../../common/dto/pagination.dto';
import { OK } from '../../common/dto/ok.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

const MAX_IMAGE = 5 * 1024 * 1024;

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser('id') id: string) {
    return this.users.me(id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update name, age, gender, country, bio, interests' })
  update(@CurrentUser('id') id: string, @Body() dto: UpdateProfileDto) {
    return this.users.update(id, dto);
  }

  @Post('avatar')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE } }))
  avatar(
    @CurrentUser('id') id: string,
    @UploadedFile(new ParseFilePipeBuilder().addMaxSizeValidator({ maxSize: MAX_IMAGE }).build()) file: Express.Multer.File,
  ) {
    return this.users.setAvatar(id, file);
  }

  @Post('onboarding/complete')
  @HttpCode(200)
  onboarded(@CurrentUser('id') id: string) {
    return this.users.completeOnboarding(id);
  }

  @Post('verification')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Selfie verification: badge at once, a reason, or `verification.status = PENDING` while staff review' })
  @UseInterceptors(FileInterceptor('selfie', { limits: { fileSize: MAX_IMAGE } }))
  verify(@CurrentUser('id') id: string, @UploadedFile() selfie?: Express.Multer.File) {
    return this.users.verifySelfie(id, selfie?.buffer ?? null);
  }

  @Get('verification')
  @ApiOperation({ summary: 'Latest selfie verification status (NONE, PENDING, APPROVED, REJECTED)' })
  verification(@CurrentUser('id') id: string) {
    return this.users.verificationStatus(id);
  }

  @Get('stats')
  stats(@CurrentUser('id') id: string) {
    return this.users.stats(id);
  }

  @Get('matches')
  matches(@CurrentUser('id') id: string, @Query() q: CursorQueryDto) {
    return this.users.matchHistory(id, q);
  }

  @Delete()
  async remove(@CurrentUser('id') id: string) {
    await this.users.deleteAccount(id);
    return OK;
  }
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get(':id')
  profile(@CurrentUser('id') me: string, @Param('id') id: string) {
    return this.users.publicProfile(me, id);
  }
}
