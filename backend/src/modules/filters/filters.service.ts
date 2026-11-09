import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock, MS } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { EconomyService } from '../catalog/economy.service';
import { EngagementService } from '../engagement/engagement.service';
import { isVip } from '../wallet/wallet.mapper';
import { WalletService } from '../wallet/wallet.service';
import { SaveFiltersDto } from './dto/filters.dto';
import { FilterAccess, readFilters, SavedFilters, usesExtraFilters } from './filters';

/** Kept from when the pass was Discover's only, so passes bought then still count. */
const passKey = (userId: string) => `discover:fpass:${userId}`;

export interface FiltersView {
  filters: SavedFilters;
  access: FilterAccess;
}

/**
 * The filters you meet people with, shared by random matches and Discover:
 * saved on your account (so every device and both screens agree), and the
 * one filter pass that opens the extra filters in both.
 */
@Injectable()
export class FiltersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly clock: Clock,
    private readonly economy: EconomyService,
    private readonly wallet: WalletService,
    private readonly engagement: EngagementService,
  ) {}

  private get rules() {
    return this.economy.rules;
  }

  async view(me: string): Promise<FiltersView> {
    return { filters: await this.saved(me), access: await this.access(me) };
  }

  async saved(me: string): Promise<SavedFilters> {
    const u = await this.prisma.user.findUnique({ where: { id: me }, select: { filters: true } });
    return readFilters(u?.filters);
  }

  /** Saves what changed. Extra filters can be saved any time; they just aren't used while locked. */
  async save(me: string, dto: SaveFiltersDto): Promise<FiltersView> {
    const cur = await this.saved(me);
    const next = readFilters({ ...cur, ...Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)) });
    if (dto.minAge !== undefined && dto.maxAge !== undefined && dto.minAge > dto.maxAge)
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'The youngest age must be below the oldest', HttpStatus.BAD_REQUEST);
    await this.prisma.user.update({ where: { id: me }, data: { filters: next as unknown as Prisma.InputJsonValue } });
    return { filters: next, access: await this.access(me) };
  }

  /** Whether the extra filters are open for this person right now. */
  async access(me: string, now: Date = this.clock.now(), vip?: boolean): Promise<FilterAccess> {
    const r = this.rules;
    const base = { passCost: r.discoverFilterPassCost, passHours: r.discoverFilterPassHours };
    const until = Number((await this.redis.client.get(passKey(me))) ?? 0);
    const passUntil = until > now.getTime() ? new Date(until).toISOString() : null;
    if (!r.discoverPremiumFilters) return { ...base, unlocked: true, reason: 'free', passUntil };
    if (vip === undefined) {
      const w = await this.prisma.wallet.findUnique({ where: { userId: me }, select: { vipUntil: true } });
      vip = isVip(w, now);
    }
    if (vip) return { ...base, unlocked: true, reason: 'vip', passUntil };
    if (passUntil) return { ...base, unlocked: true, reason: 'pass', passUntil };
    if (this.engagement.isVibeHour(now)) return { ...base, unlocked: true, reason: 'vibe_hour', passUntil };
    return { ...base, unlocked: false, reason: null, passUntil: null };
  }

  /** Throws FILTERS_LOCKED (402) when these filters need a pass you don't have. */
  async assertAllowed(me: string, f: Pick<SavedFilters, 'gender' | 'countryCode'>, now: Date = this.clock.now(), vip?: boolean): Promise<void> {
    if (!usesExtraFilters(f)) return;
    const a = await this.access(me, now, vip);
    if (!a.unlocked)
      throw new AppError(ErrorCode.FILTERS_LOCKED, 'These filters need VIP or a filter pass', HttpStatus.PAYMENT_REQUIRED, { passCost: a.passCost, passHours: a.passHours });
  }

  /** The filter pass: extra filters in random matches and Discover for `discoverFilterPassHours`. Not charged while they're already open. */
  async buyPass(me: string): Promise<FiltersView> {
    const now = this.clock.now();
    const a = await this.access(me, now);
    if (a.unlocked && a.reason !== 'vibe_hour') return this.view(me);
    const until = now.getTime() + this.rules.discoverFilterPassHours * MS.hour;
    await this.wallet.spend(me, this.rules.discoverFilterPassCost, `Filter pass · ${this.rules.discoverFilterPassHours} hours`, {
      idempotencyKey: `fpass:${me}:${Math.floor(now.getTime() / MS.minute)}`,
    });
    this.wallet.changed([me]);
    await this.redis.client.set(passKey(me), String(until), 'PX', until - now.getTime());
    return this.view(me);
  }
}
