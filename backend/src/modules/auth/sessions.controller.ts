import { Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { SessionsService } from './sessions.service';

/** Settings → Devices: where you're signed in, and signing devices out. */
@ApiTags('auth')
@ApiBearerAuth()
@Controller('me/sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  @ApiOperation({ summary: 'Devices you are signed in on: phone or web, which device, when last used; this one first' })
  list(@CurrentUser() me: AuthUser) {
    return this.sessions.listMine(me);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Sign one device out (it goes back to sign-in at once)' })
  end(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.sessions.end(me.id, id, 'remote');
  }

  @Post('sign-out-others')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign out every device except this one' })
  async others(@CurrentUser() me: AuthUser) {
    return this.sessions.endAll(me.id, 'remote', await this.sessions.familyOf(me));
  }
}
