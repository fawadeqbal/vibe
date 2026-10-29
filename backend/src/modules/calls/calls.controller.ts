import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CallsService } from './calls.service';
import { CallConsentDto, CallVideoDto, DeclineCallDto, RingDto } from './dto/calls.dto';

@ApiTags('calls')
@ApiBearerAuth()
@Controller()
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Get('friends/:userId/calls')
  @ApiOperation({ summary: 'Video calls in this chat: who allowed them, and whether you can ask now' })
  state(@CurrentUser('id') me: string, @Param('userId') userId: string) {
    return this.calls.state(me, userId);
  }

  @Put('friends/:userId/calls')
  @ApiOperation({
    summary:
      'allow: true asks them (or says yes to their ask); allow: false turns calls off for both. Both sides get `call:consent`.',
  })
  consent(@CurrentUser('id') me: string, @Param('userId') userId: string, @Body() dto: CallConsentDto) {
    return dto.allow ? this.calls.allow(me, userId, dto.video ?? true) : this.calls.turnOff(me, userId);
  }

  @Post('friends/:userId/call')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Ring a friend (both must have allowed calls). They get `call:incoming`; answered, both get `match:found` with friendCall: true.',
  })
  ring(@CurrentUser('id') me: string, @Param('userId') userId: string, @Body() dto: RingDto) {
    return this.calls.ring(me, userId, dto?.media ?? 'video');
  }

  @Post('calls/live/:matchId/video')
  @HttpCode(200)
  @ApiOperation({ summary: 'In a voice call with a friend: ask to turn on video, or answer (yes/no). Both must allow video in the chat. `call:video` to both.' })
  video(@CurrentUser('id') me: string, @Param('matchId') matchId: string, @Body() dto: CallVideoDto) {
    return this.calls.video(me, matchId, dto.action);
  }

  @Get('calls/incoming')
  @ApiOperation({ summary: 'The call ringing for you right now, or null' })
  async incoming(@CurrentUser('id') me: string) {
    return { call: await this.calls.incoming(me) };
  }

  @Post('calls/:callId/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Pick up' })
  accept(@CurrentUser('id') me: string, @Param('callId') callId: string) {
    return this.calls.accept(me, callId);
  }

  @Post('calls/:callId/decline')
  @HttpCode(200)
  @ApiOperation({ summary: 'Decline, optionally with a quick reply sent as a message' })
  async decline(@CurrentUser('id') me: string, @Param('callId') callId: string, @Body() dto: DeclineCallDto) {
    await this.calls.decline(me, callId, dto.reply);
    return { ok: true };
  }

  @Post('calls/:callId/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Hang up before they answer (a missed call for them)' })
  async cancel(@CurrentUser('id') me: string, @Param('callId') callId: string) {
    await this.calls.cancel(me, callId);
    return { ok: true };
  }
}
