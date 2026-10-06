import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { RedisService } from '../../infra/redis/redis.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { GameId, pickPrompt, Prompt, PROMPTS } from './icebreakers';
import { MatchSessionStore } from './match-session.store';

const STATE = (matchId: string) => `mgame:${matchId}`;
const ANSWERS = (matchId: string, round: number) => `mgame:${matchId}:a:${round}`;
const RATE = (matchId: string) => `mgame:${matchId}:rl`;
/** Prompts already shown in this match, per game — kept across close/start so nothing repeats. */
const USED = (matchId: string) => `mgame:${matchId}:used`;
const TTL = 3600;
const RATE_MS = 2000;

interface GameState {
  game: GameId;
  round: number;
  prompt: Prompt;
}

export const MATCH_GAME = 'match.game';
export interface MatchGameEvent {
  matchId: string;
  from: string;
  to: string;
  game: GameId;
  round: number;
  prompt: Prompt;
}

export interface GameView {
  matchId: string;
  game: GameId;
  round: number;
  prompt: Prompt;
  by: 'me' | 'partner';
}

export interface GameAnswerView {
  matchId: string;
  round: number;
  mine: 0 | 1 | null;
  /** Only once both answered. */
  theirs: 0 | 1 | null;
  revealed: boolean;
  /** The other person has answered (their choice stays hidden until you answer too). */
  partnerAnswered: boolean;
}

export type GameAction = { action: 'start'; game: GameId } | { action: 'next' } | { action: 'answer'; choice?: 0 | 1; round?: number } | { action: 'close' };

/**
 * Icebreaker games during a call. One game per match in Redis (`mgame:*`,
 * 1 h); answers go in a per-round hash so two people answering at the same
 * moment can't overwrite each other. Either person can start, skip, answer
 * or close; both always get the same events.
 */
@Injectable()
export class MatchGamesService {
  constructor(
    private readonly redis: RedisService,
    private readonly sessions: MatchSessionStore,
    private readonly realtime: RealtimeService,
    private readonly events: EventEmitter2,
  ) {}

  async handle(userId: string, a: GameAction): Promise<GameView | GameAnswerView | { matchId: string }> {
    const m = await this.sessions.forUser(userId);
    if (!m) throw new AppError(ErrorCode.NOT_IN_MATCH, 'You are not in a call', HttpStatus.CONFLICT);
    const partnerId = m.a === userId ? m.b : m.a;
    switch (a.action) {
      case 'start':
        return this.show(m.id, userId, partnerId, a.game);
      case 'next': {
        const s = await this.state(m.id);
        if (!s) throw AppError.conflict('No game is open', ErrorCode.CONFLICT);
        return this.show(m.id, userId, partnerId, s.game);
      }
      case 'answer':
        return this.answer(m.id, userId, partnerId, a.choice, a.round);
      case 'close':
        await this.clear(m.id, false);
        this.realtime.toUser(userId, ServerEvent.MatchGameClosed, { matchId: m.id });
        this.realtime.toUser(partnerId, ServerEvent.MatchGameClosed, { matchId: m.id });
        return { matchId: m.id };
    }
  }

  private async show(matchId: string, userId: string, partnerId: string, game: GameId): Promise<GameView> {
    if (!(await this.redis.client.set(RATE(matchId), '1', 'PX', RATE_MS, 'NX'))) throw new AppError(ErrorCode.RATE_LIMITED, 'One moment…', HttpStatus.TOO_MANY_REQUESTS);
    const prev = await this.state(matchId);
    const used = (await this.redis.getJson<Partial<Record<GameId, number[]>>>(USED(matchId))) ?? {};
    const seen = used[game] ?? [];
    const idx = pickPrompt(game, seen);
    used[game] = seen.length >= PROMPTS[game].length ? [idx] : [...seen, idx];
    const state: GameState = { game, round: (prev?.round ?? 0) + 1, prompt: PROMPTS[game][idx] };
    await this.redis.setJson(USED(matchId), used, TTL);
    await this.redis.setJson(STATE(matchId), state, TTL);
    const base = { matchId, game, round: state.round, prompt: state.prompt };
    this.realtime.toUser(partnerId, ServerEvent.MatchGame, { ...base, by: 'partner' });
    this.realtime.toUser(userId, ServerEvent.MatchGame, { ...base, by: 'me' });
    this.events.emit(MATCH_GAME, { matchId, from: userId, to: partnerId, game, round: state.round, prompt: state.prompt } satisfies MatchGameEvent);
    return { ...base, by: 'me' };
  }

  private async answer(matchId: string, userId: string, partnerId: string, choice: 0 | 1 | undefined, round?: number): Promise<GameAnswerView> {
    const s = await this.state(matchId);
    if (!s) throw AppError.conflict('No game is open', ErrorCode.CONFLICT);
    if (round !== undefined && round !== s.round) throw AppError.conflict('That question has moved on', ErrorCode.CONFLICT, { round: s.round });
    const needsChoice = !!s.prompt.options;
    if (needsChoice && choice !== 0 && choice !== 1) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Pick one of the two options');
    const key = ANSWERS(matchId, s.round);
    // First answer wins; "-" = answered a question without options.
    await this.redis.client.multi().hsetnx(key, userId, needsChoice ? String(choice) : '-').expire(key, TTL).exec();
    const all = await this.redis.client.hgetall(key);
    const parse = (v: string | undefined): 0 | 1 | null => (v === '0' ? 0 : v === '1' ? 1 : null);
    const revealed = userId in all && partnerId in all;
    const view = (me: string, other: string): GameAnswerView => ({ matchId, round: s.round, mine: parse(all[me]), theirs: revealed ? parse(all[other]) : null, revealed, partnerAnswered: other in all });
    this.realtime.toUser(partnerId, ServerEvent.MatchGameAnswer, view(partnerId, userId));
    const mine = view(userId, partnerId);
    this.realtime.toUser(userId, ServerEvent.MatchGameAnswer, mine);
    return mine;
  }

  private state(matchId: string): Promise<GameState | null> {
    return this.redis.getJson<GameState>(STATE(matchId));
  }

  /** Game closed (keeps the used-prompt list), or the match is over (`all`). */
  async clear(matchId: string, all = true): Promise<void> {
    const s = await this.state(matchId);
    const keys = [STATE(matchId), ...(all ? [RATE(matchId), USED(matchId)] : [])];
    for (let r = 1; r <= (s?.round ?? 0); r++) keys.push(ANSWERS(matchId, r));
    await this.redis.client.del(...keys);
  }
}
