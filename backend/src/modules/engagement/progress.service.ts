import { Injectable, Logger } from '@nestjs/common';
import { UserStatus } from '@prisma/client';

import { Clock, MS } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { RedisService } from '../../infra/redis/redis.service';
import { AppError } from '../../common/errors/app-error';
import { badgesFor, badgeStatsOf, BadgeView } from '../users/badges';
import { levelOf, levelProgress, LevelProgress } from '../users/levels';
import { PROFILE_INCLUDE, PublicProfile, toPublicProfile } from '../users/user.mapper';
import { EngagementService } from './engagement.service';

export type XpReason = 'good-call' | 'like' | 'gift' | 'check-in' | 'streak';
export type Board = 'xp' | 'gems';
export const BOARDS: readonly Board[] = ['xp', 'gems'];

/** Weekly leaderboard sorted set; kept three weeks. */
export const boardKey = (board: Board, week: number) => `lb:${board}:${week}`;
const BOARD_TTL_SECONDS = 21 * 24 * 3600;
const TOP = 50;

export interface ProgressView extends LevelProgress {
  /** XP earned this week (the leaderboard score). */
  weekXp: number;
  badges: BadgeView[];
}

export interface LeaderboardView {
  board: Board;
  weekStart: string;
  weekEnd: string;
  top: { rank: number; profile: PublicProfile; score: number }[];
  me: { rank: number | null; score: number };
}

/**
 * XP, levels, badges and weekly leaderboards. `award` is the single place XP
 * is given (doubled during Vibe Hour); it also feeds the weekly board and
 * announces level-ups. Callers award after their transaction commits; XP is
 * best effort and never fails the action that earned it.
 */
@Injectable()
export class ProgressService {
  private readonly logger = new Logger(ProgressService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
    private readonly clock: Clock,
    private readonly engagement: EngagementService,
  ) {}

  async award(userId: string, amount: number, reason: XpReason): Promise<number> {
    if (!(amount > 0)) return 0;
    try {
      const xp = this.engagement.isVibeHour() ? amount * 2 : amount;
      const u = await this.prisma.user.update({ where: { id: userId }, data: { xp: { increment: xp } }, select: { xp: true } });
      await this.bump('xp', userId, xp);
      const level = levelOf(u.xp);
      if (level > levelOf(u.xp - xp)) this.realtime.toUser(userId, ServerEvent.LevelUp, { level });
      return xp;
    } catch (e) {
      this.logger.warn(`xp (${reason}) for ${userId} failed: ${(e as Error).message}`);
      return 0;
    }
  }

  /** Gems received from gifts count toward this week's "Most gifted" board. */
  async addGems(userId: string, gems: number): Promise<void> {
    if (gems > 0) await this.bump('gems', userId, gems).catch(() => undefined);
  }

  private async bump(board: Board, userId: string, n: number): Promise<void> {
    const key = boardKey(board, this.clock.weekIndex());
    await this.redis.client.multi().zincrby(key, n, userId).expire(key, BOARD_TTL_SECONDS).exec();
  }

  async weekScore(board: Board, userId: string): Promise<number> {
    return Number((await this.redis.client.zscore(boardKey(board, this.clock.weekIndex()), userId)) ?? 0);
  }

  async level(userId: string): Promise<LevelProgress> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { xp: true } });
    if (!u) throw AppError.notFound('User');
    return levelProgress(u.xp);
  }

  async progress(userId: string): Promise<ProgressView> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw AppError.notFound('User');
    return { ...levelProgress(u.xp), weekXp: await this.weekScore('xp', userId), badges: badgesFor(badgeStatsOf(u)) };
  }

  /**
   * This week's top 50. Bots, banned and deleted people are dropped at read
   * time (we over-fetch to fill the list); ranks count only the people shown.
   * Your own rank is exact when you are in the top, otherwise your raw
   * position in the set.
   */
  async leaderboard(board: Board, me: string): Promise<LeaderboardView> {
    const week = this.clock.weekIndex();
    const key = boardKey(board, week);
    const raw = await this.redis.client.zrevrange(key, 0, TOP * 3 - 1, 'WITHSCORES');
    const ids: string[] = [];
    const scores = new Map<string, number>();
    for (let i = 0; i < raw.length; i += 2) {
      ids.push(raw[i]);
      scores.set(raw[i], Number(raw[i + 1]));
    }
    const now = this.clock.now();
    const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids }, status: UserStatus.ACTIVE, isBot: false, OR: [{ bannedUntil: null }, { bannedUntil: { lte: now } }] }, include: PROFILE_INCLUDE }) : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    const top = ids
      .filter((id) => byId.has(id) && scores.get(id)! > 0)
      .slice(0, TOP)
      .map((id, i) => ({ rank: i + 1, profile: toPublicProfile(byId.get(id)!, now), score: scores.get(id)! }));
    const myScore = Number((await this.redis.client.zscore(key, me)) ?? 0);
    const mine = top.find((r) => r.profile.id === me);
    const rawRank = myScore > 0 ? await this.redis.client.zrevrank(key, me) : null;
    const weekStart = this.clock.weekStart(week);
    return {
      board,
      weekStart: weekStart.toISOString(),
      weekEnd: new Date(weekStart.getTime() + 7 * MS.day).toISOString(),
      top,
      me: { rank: mine?.rank ?? (rawRank === null ? null : rawRank + 1), score: myScore },
    };
  }
}
