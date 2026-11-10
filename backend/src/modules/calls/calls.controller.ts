import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CallsService } from './calls.service';
import { CallConsentDto, AcceptCallDto, CallVideoDto, DeclineCallDto, RingDto } from './dto/calls.dto';

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

  @Get('friends/:userId/calls/history')
  @ApiOperation({ summary: 'Your calls with this friend, newest first (missed, declined, ended)' })
  history(@CurrentUser('id') me: string, @Param('userId') userId: string) {
    return this.calls.history(me, userId);
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
      'Call a friend (both must have allowed calls). Returns the call snapshot; both get `call:state`. It rings only if they\'re in the app and free (else it ends at once: unavailable / busy). Answered: `match:found` with friendCall: true.',
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

  @Get('calls/current')
  @ApiOperation({ summary: 'Your call that isn\'t over yet (any state), or null: what a device redraws from on connect, on returning to the app, and while a call screen is open' })
  async current(@CurrentUser('id') me: string) {
    return { call: await this.calls.current(me) };
  }

  @Get('calls/:callId')
  @ApiOperation({ summary: 'One of your calls, as it is now (kept a day after it ends)' })
  get(@CurrentUser('id') me: string, @Param('callId') callId: string) {
    return this.calls.get(me, callId);
  }

  @Post('calls/:callId/ringing')
  @HttpCode(200)
  @ApiOperation({ summary: 'Your device is showing this call: the caller\'s "Calling…" becomes "Ringing…"' })
  ringing(@CurrentUser('id') me: string, @Param('callId') callId: string) {
    return this.calls.reached(me, callId);
  }

  @Post('calls/:callId/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Pick up (the first device wins): connecting, then match:found to both. Too late: 409 CALL_NOT_FOUND' })
  accept(@CurrentUser('id') me: string, @Param('callId') callId: string, @Body() dto: AcceptCallDto) {
    return this.calls.accept(me, callId, { voiceOnly: dto?.media === 'voice', deviceId: dto?.deviceId });
  }

  @Post('calls/:callId/decline')
  @HttpCode(200)
  @ApiOperation({ summary: 'Decline, optionally with a quick reply sent as a message' })
  decline(@CurrentUser('id') me: string, @Param('callId') callId: string, @Body() dto: DeclineCallDto) {
    return this.calls.decline(me, callId, dto.reply);
  }

  @Post('calls/:callId/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'The caller hangs up: cancelled while ringing (a missed call for them), hung_up while connecting' })
  cancel(@CurrentUser('id') me: string, @Param('callId') callId: string) {
    return this.calls.cancel(me, callId);
  }

  @Post('calls/:callId/up')
  @HttpCode(200)
  @ApiOperation({ summary: 'Your video or voice is flowing in this call; when both are, it\'s live' })
  up(@CurrentUser('id') me: string, @Param('callId') callId: string) {
    return this.calls.up(me, callId);
  }
}
