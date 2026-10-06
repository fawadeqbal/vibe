import { UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import type { Socket } from 'socket.io';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { WsExceptionFilter } from '../../common/filters/ws-exception.filter';
import type { AuthUser } from '../../common/types/auth-user';
import { ChatDto, GameDto, GiftDto, JoinDto, MatchReportDto, NextDto, SignalDto } from './dto/match.dto';
import { GameAction, MatchGamesService } from './match-games.service';
import { MatchingService } from './matching.service';

type Ack<T> = { ok: true; data: T };
const ok = <T>(data: T): Ack<T> => ({ ok: true, data });
const uid = (s: Socket) => (s.data.user as AuthUser).id;

/**
 * Client → server match events. Every handler acks `{ ok, data | error }`;
 * the server pushes `match:*` / `rtc:signal` events to the user's room.
 */
@UseFilters(WsExceptionFilter)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@WebSocketGateway()
export class MatchGateway {
  constructor(
    private readonly matching: MatchingService,
    private readonly games: MatchGamesService,
  ) {}

  @SubscribeMessage('match:join')
  async join(@ConnectedSocket() s: Socket, @MessageBody() dto: JoinDto) {
    return ok(await this.matching.join(uid(s), { gender: dto.gender, countryCode: dto.countryCode ?? null, safeMode: dto.safeMode, autoBlur: dto.autoBlur }));
  }

  @SubscribeMessage('match:leave')
  async leave(@ConnectedSocket() s: Socket) {
    await this.matching.leave(uid(s));
    return ok(null);
  }

  @SubscribeMessage('match:next')
  async next(@ConnectedSocket() s: Socket, @MessageBody() dto: NextDto) {
    return ok(await this.matching.next(uid(s), dto?.payToBypass ?? false));
  }

  @SubscribeMessage('match:end')
  async end(@ConnectedSocket() s: Socket) {
    await this.matching.end(uid(s));
    return ok(null);
  }

  /** Ack data: `{ mutual }` — true when they had already liked you (both also get `match:mutual`). */
  @SubscribeMessage('match:like')
  async like(@ConnectedSocket() s: Socket) {
    return ok(await this.matching.like(uid(s)));
  }

  /** Icebreaker games: `{ action: start|next|answer|close, game?, choice?, round? }`. */
  @SubscribeMessage('match:game')
  async game(@ConnectedSocket() s: Socket, @MessageBody() dto: GameDto) {
    if (dto.action === 'start' && !dto.game) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Pick a game');
    return ok(await this.games.handle(uid(s), dto as GameAction));
  }

  @SubscribeMessage('match:chat')
  async chat(@ConnectedSocket() s: Socket, @MessageBody() dto: ChatDto) {
    return ok(await this.matching.chat(uid(s), dto.text));
  }

  @SubscribeMessage('match:gift')
  async gift(@ConnectedSocket() s: Socket, @MessageBody() dto: GiftDto) {
    return ok(await this.matching.gift(uid(s), dto.giftId, dto.idempotencyKey));
  }

  @SubscribeMessage('match:friend')
  async friend(@ConnectedSocket() s: Socket) {
    return ok(await this.matching.addFriend(uid(s)));
  }

  @SubscribeMessage('match:report')
  async report(@ConnectedSocket() s: Socket, @MessageBody() dto: MatchReportDto) {
    return ok(await this.matching.report(uid(s), dto));
  }

  @SubscribeMessage('match:reconnect')
  async reconnect(@ConnectedSocket() s: Socket) {
    return ok(await this.matching.reconnect(uid(s)));
  }

  @SubscribeMessage('rtc:signal')
  async signal(@ConnectedSocket() s: Socket, @MessageBody() dto: SignalDto) {
    await this.matching.signal(uid(s), dto);
    return ok(null);
  }
}
