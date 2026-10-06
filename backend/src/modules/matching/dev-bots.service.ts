import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import { Gender, LedgerKind } from '@prisma/client';

import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { EconomyService } from '../catalog/economy.service';
import { FriendsService } from '../social/friends.service';
import { FRIEND_MESSAGE, FriendMessageEvent, MessagesService } from '../social/messages.service';
import { LedgerService } from '../wallet/ledger.service';
import { compatible } from './compatibility';
import { MATCH_GAME, MatchGameEvent, MatchGamesService } from './match-games.service';
import { MatchQueueService } from './match-queue.service';
import { MatchSessionStore } from './match-session.store';
import { MATCH_ACTION, MATCH_ENDED, MATCH_STARTED, MatchActionEvent, MatchingService, MatchStartedEvent } from './matching.service';
import { Ticket } from './matching.types';

const BOTS: [name: string, gender: Gender, country: string, age: number, photo: number, interests: string[]][] = [
  ['Ayesha', 'FEMALE', 'PK', 23, 44, ['Music', 'Travel', 'Coffee']],
  ['Sara', 'FEMALE', 'PK', 21, 32, ['Books', 'Art', 'Cooking']],
  ['Priya', 'FEMALE', 'IN', 25, 26, ['Music', 'Dance', 'Movies']],
  ['Neha', 'FEMALE', 'IN', 22, 16, ['Fashion', 'Travel', 'Memes']],
  ['Emily', 'FEMALE', 'US', 26, 5, ['Fitness', 'Coffee', 'Pets']],
  ['Sofia', 'FEMALE', 'US', 24, 20, ['Music', 'Travel', 'Photography']],
  ['Olivia', 'FEMALE', 'GB', 27, 9, ['Books', 'Languages', 'Coffee']],
  ['Elif', 'FEMALE', 'TR', 23, 23, ['Art', 'Music', 'Anime']],
  ['Julia', 'FEMALE', 'BR', 22, 36, ['Dance', 'Football', 'Memes']],
  ['Chloé', 'FEMALE', 'FR', 24, 28, ['Fashion', 'Cooking', 'Travel']],
  ['Noor', 'FEMALE', 'AE', 25, 43, ['Travel', 'Photography', 'Tech']],
  ['Amara', 'FEMALE', 'NG', 26, 49, ['Music', 'Fitness', 'Movies']],
  ['Bilal', 'MALE', 'PK', 27, 59, ['Cricket', 'Tech', 'Gaming']],
  ['Hamza', 'MALE', 'PK', 24, 13, ['Cricket', 'Cars', 'Music']],
  ['Arjun', 'MALE', 'IN', 28, 56, ['Movies', 'Fitness', 'Tech']],
  ['Jake', 'MALE', 'US', 29, 8, ['Gaming', 'Music', 'Memes']],
  ['Liam', 'MALE', 'GB', 25, 12, ['Football', 'Travel', 'Coffee']],
  ['Mert', 'MALE', 'TR', 26, 53, ['Football', 'Cooking', 'Music']],
  ['Lucas', 'MALE', 'BR', 30, 60, ['Football', 'Dance', 'Travel']],
  ['Omar', 'MALE', 'AE', 29, 11, ['Cars', 'Fitness', 'Travel']],
  ['Min-jun', 'MALE', 'KR', 27, 33, ['Gaming', 'Anime', 'Music']],
  ['Diego', 'MALE', 'MX', 25, 14, ['Music', 'Football', 'Movies']],
  ['Chidi', 'MALE', 'NG', 29, 51, ['Fashion', 'Music', 'Books']],
  ['Noah', 'MALE', 'CA', 30, 68, ['Photography', 'Travel', 'Pets']],
];

const BIOS = ['Here for good conversations, not small talk.', 'Night owl. Ask me about my playlist.', 'Learning three languages badly at once.', 'Coffee first, then we talk.', 'Travel stories welcome. Will trade one for one.', 'Gamer by night, designer by day.'];
const OPENERS = ['hey! where are you from?', 'nice to meet you 😄', 'what are you up to tonight?', 'your background looks cool', 'first time on Vibe?', 'haha hi', 'what music do you like?', 'ok you seem fun'];
const REPLIES = ['haha same', 'that is actually so true', 'wait really?', 'send me your playlist later', 'no way, me too', 'lol', 'tell me more', 'brb, dog is barking'];

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const between = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo));

/**
 * DEVELOPMENT ONLY. With one phone you can't test matching, so after
 * DEV_BOTS_AFTER_MS of waiting a scripted bot partner takes the call: it
 * chats, sometimes likes you, sends a gift, asks to be friends, or leaves —
 * the same behaviour the app's offline mock had. Bots have no camera; the
 * app shows their photo. Production refuses to start with this enabled.
 */
@Injectable()
export class DevBotsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DevBotsService.name);
  private readonly timers = new Map<string, NodeJS.Timeout[]>();
  private bots: Ticket[] = [];

  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly ledger: LedgerService,
    private readonly queue: MatchQueueService,
    private readonly sessions: MatchSessionStore,
    private readonly matching: MatchingService,
    private readonly friends: FriendsService,
    private readonly messages: MessagesService,
    private readonly economy: EconomyService,
    private readonly games: MatchGamesService,
  ) {}

  private get enabled(): boolean {
    return this.config.get('DEV_BOTS_AFTER_MS') > 0 && !this.config.isProduction;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) return;
    await this.seed();
    this.logger.warn(`Dev bots ON: ${this.bots.length} scripted partners join after ${this.config.get('DEV_BOTS_AFTER_MS')} ms`);
  }

  onModuleDestroy(): void {
    for (const list of this.timers.values()) list.forEach(clearTimeout);
  }

  private async seed(): Promise<void> {
    for (const [i, [name, gender, countryCode, age, photo, interests]] of BOTS.entries()) {
      const inviteCode = `BOT${String(i).padStart(4, '0')}`;
      const existing = await this.prisma.user.findUnique({ where: { inviteCode } });
      if (!existing) {
        await this.prisma.$transaction(async (tx) => {
          const u = await tx.user.create({
            data: { isBot: true, name, gender, countryCode, age, interests, verified: i % 3 !== 2, bio: BIOS[i % BIOS.length], avatarUrl: `https://i.pravatar.cc/400?img=${photo}`, inviteCode, onboardedAt: new Date() },
          });
          await tx.wallet.create({ data: { userId: u.id } });
          await this.ledger.move(u.id, { coins: 1_000_000, kind: LedgerKind.ADJUSTMENT, title: 'Dev bot float', idempotencyKey: 'bot-float' }, { tx });
        });
      }
    }
    const rows = await this.prisma.user.findMany({ where: { isBot: true } });
    this.bots = rows.map((u) => ({
      userId: u.id,
      gender: u.gender,
      countryCode: u.countryCode,
      verified: u.verified,
      prefs: { gender: 'ANYONE', countryCode: null, safeMode: false, autoBlur: false },
      cost: 0,
      vip: false,
      boosted: false,
      enqueuedAt: 0,
      exclude: [],
      interests: u.interests,
      vibeScore: 0.5,
    }));
  }

  /** People who have waited long enough get a bot. */
  @Interval(1000)
  async assignBots(): Promise<void> {
    if (!this.enabled || !this.bots.length) return;
    await this.redis.withLock('dev-bots', 5000, async () => {
      const waitMs = this.config.get('DEV_BOTS_AFTER_MS');
      for (const id of await this.queue.head(20)) {
        const t = await this.queue.ticket(id);
        if (!t || Date.now() - t.enqueuedAt < waitMs) continue;
        const free: Ticket[] = [];
        for (const b of this.bots) if (!(await this.sessions.forUser(b.userId))) free.push(b);
        const bot = free.filter((b) => compatible(t, { ...b, enqueuedAt: Date.now() })).sort(() => Math.random() - 0.5)[0];
        if (!bot) continue;
        if (!(await this.queue.remove(id))) continue; // matched with a human meanwhile
        await this.matching.connect({ ...t }, { ...bot, enqueuedAt: Date.now() }, false);
      }
    });
  }

  private botIn(e: { a: string; b: string }): { bot: string; human: string } | null {
    const isBot = (id: string) => this.bots.some((b) => b.userId === id);
    if (isBot(e.a) && !isBot(e.b)) return { bot: e.a, human: e.b };
    if (isBot(e.b) && !isBot(e.a)) return { bot: e.b, human: e.a };
    return null;
  }

  private later(key: string, ms: number, fn: () => Promise<unknown>): void {
    const t = setTimeout(() => void fn().catch((err) => this.logger.debug(`bot action skipped: ${(err as Error).message}`)), ms);
    this.timers.set(key, [...(this.timers.get(key) ?? []), t]);
  }

  @OnEvent(MATCH_STARTED)
  onStarted(e: MatchStartedEvent): void {
    const pair = this.botIn(e);
    if (!pair) return;
    const { bot } = pair;
    let at = between(2000, 5000);
    this.later(e.matchId, at, () => this.matching.chat(bot, pick(OPENERS)));
    for (let i = 0, n = between(1, 4); i < n; i++) {
      at += between(5000, 13000);
      this.later(e.matchId, at, () => this.matching.chat(bot, pick(REPLIES)));
    }
    if (Math.random() < 0.4) this.later(e.matchId, between(8000, 28000), () => this.matching.like(bot));
    if (Math.random() < 0.2) this.later(e.matchId, between(15000, 40000), () => this.matching.gift(bot, pick(this.economy.gifts.slice(0, 3)).id));
    if (Math.random() < 0.3) this.later(e.matchId, between(20000, 50000), () => this.matching.addFriend(bot));
    if (Math.random() < 0.6) this.later(e.matchId, between(35000, 115000), () => this.matching.end(bot));
  }

  @OnEvent(MATCH_ENDED)
  onEnded(e: MatchStartedEvent): void {
    this.timers.get(e.matchId)?.forEach(clearTimeout);
    this.timers.delete(e.matchId);
  }

  @OnEvent(MATCH_ACTION)
  onAction(e: MatchActionEvent): void {
    if (!this.bots.some((b) => b.userId === e.to)) return;
    if (e.action === 'chat') this.later(e.matchId, between(2000, 4500), () => this.matching.chat(e.to, pick(REPLIES)));
    if (e.action === 'gift') this.later(e.matchId, 2000, () => this.matching.chat(e.to, `omg thank you for the ${e.text?.toLowerCase()} 🥹`));
    if (e.action === 'friend') this.later(e.matchId, between(2000, 5000), () => this.friends.request(e.to, e.from));
  }

  /** Bots play along with icebreakers: they pick an option after a few seconds. */
  @OnEvent(MATCH_GAME)
  onGame(e: MatchGameEvent): void {
    if (!this.bots.some((b) => b.userId === e.to)) return;
    const choice = (Math.random() < 0.5 ? 0 : 1) as 0 | 1;
    this.later(e.matchId, between(2000, 5000), () => this.games.handle(e.to, { action: 'answer', choice: e.prompt.options ? choice : undefined, round: e.round }));
  }

  /** Bot friends answer messages too. */
  @OnEvent(FRIEND_MESSAGE)
  onMessage(e: FriendMessageEvent): void {
    if (!this.bots.some((b) => b.userId === e.to)) return;
    const reply = e.giftId ? 'aww thank you!! 🥹' : pick(REPLIES);
    this.later(`dm:${e.to}:${e.from}`, between(2000, 6000), () => this.messages.send(e.to, e.from, reply));
  }
}
