import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProfilesService } from './profiles.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get(':id/view')
  @ApiOperation({ summary: 'A profile as you may see it: counts and stats once you follow, online once you are friends; 404 if you never met' })
  view(@CurrentUser('id') me: string, @Param('id') id: string) {
    return this.profiles.view(me, id);
  }
}
