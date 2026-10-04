import { HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { isDeepStrictEqual } from 'node:util';
import type { ZodTypeAny } from 'zod';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { RedisService } from '../../infra/redis/redis.service';
import {
  CoinPack,
  COUNTRY_CODES,
  DEFAULT_ECONOMY,
  DEFAULT_RULES,
  ECONOMY_SECTIONS,
  EconomyRules,
  EconomySection,
  EconomySnapshot,
  filterCost,
  gemsFor,
  gemsToUsdCents,
  Gift,
  GiftsSchema,
  INTERESTS,
  isEconomySection,
  MatchFilterInput,
  packTotalCoins,
  PacksSchema,
  PlansSchema,
  RULE_FIELDS,
  RULE_GROUPS,
  RulesPatchSchema,
  RulesSchema,
  VipPlan,
} from './economy';

const CHANNEL = 'economy:changed';
const KEY = (s: EconomySection) => `economy.${s}`;
/** Safety net if a pub/sub message is ever missed. */
const RELOAD_MS = 60_000;

const LIST_SCHEMA: Record<Exclude<EconomySection, 'rules'>, ZodTypeAny> = { packs: PacksSchema, plans: PlansSchema, gifts: GiftsSchema };

/** `totalCoins` and `gems` are computed; editors may send lists back with them still on. */
const withoutDerived = (v: unknown): unknown =>
  Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? Object.fromEntries(Object.entries(x as object).filter(([k]) => k !== 'totalCoins' && k !== 'gems')) : x)) : v;

interface SectionMeta {
  custom: boolean;
  updatedAt: string | null;
  updatedById: string | null;
}

/**
 * The live prices and rules. Values are code defaults overridden by what
 * staff saved (stored per section in `AppSetting` as `economy.*`). Reads are
 * synchronous from memory — they sit on every charge — and every instance
 * reloads the moment one of them saves (Redis pub/sub). A save also tells
 * every connected app to re-read the catalog.
 */
@Injectable()
export class EconomyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EconomyService.name);
  private snap: EconomySnapshot = DEFAULT_ECONOMY;
  private meta: Record<EconomySection, SectionMeta> = Object.fromEntries(ECONOMY_SECTIONS.map((s) => [s, { custom: false, updatedAt: null, updatedById: null }])) as Record<EconomySection, SectionMeta>;
  private sub?: Redis;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
    this.sub = this.redis.create('economy-sub');
    await this.sub.subscribe(CHANNEL);
    this.sub.on('message', () => void this.reload());
    this.timer = setInterval(() => void this.reload(), RELOAD_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.sub?.quit().catch(() => undefined);
  }

  // ── live values ───────────────────────────────────────────────────────────

  get rules(): Readonly<EconomyRules> {
    return this.snap.rules;
  }
  get packs(): readonly CoinPack[] {
    return this.snap.packs;
  }
  get plans(): readonly VipPlan[] {
    return this.snap.plans;
  }
  get gifts(): readonly Gift[] {
    return this.snap.gifts;
  }

  findPack = (id: string): CoinPack | undefined => this.snap.packs.find((p) => p.id === id);
  findPlan = (id: string): VipPlan | undefined => this.snap.plans.find((p) => p.id === id);
  findGift = (id: string): Gift | undefined => this.snap.gifts.find((g) => g.id === id);
  gemsFor = (gift: Pick<Gift, 'coins'>): number => gemsFor(gift, this.snap.rules);
  gemsToUsdCents = (gems: number): number => gemsToUsdCents(gems, this.snap.rules);
  filterCost = (f: MatchFilterInput, vip: boolean): number => filterCost(f, vip, this.snap.rules);
  packTotalCoins = packTotalCoins;

  /** Changes whenever any section is saved; the app compares it to skip re-rendering. */
  get version(): string {
    const latest = ECONOMY_SECTIONS.map((s) => this.meta[s].updatedAt ?? '').sort().pop();
    return latest || 'default';
  }

  /** The public catalog the app renders its store, gifts and prices from. */
  catalog() {
    return {
      version: this.version,
      economy: this.snap.rules,
      packs: this.snap.packs.map((p) => ({ ...p, totalCoins: packTotalCoins(p) })),
      plans: this.snap.plans,
      gifts: this.snap.gifts.map((g) => ({ ...g, gems: this.gemsFor(g) })),
      countries: COUNTRY_CODES,
      interests: INTERESTS,
    };
  }

  // ── admin ─────────────────────────────────────────────────────────────────

  /** Everything the Economy page needs: values, defaults, field definitions, who changed what. */
  async describe() {
    const ids = ECONOMY_SECTIONS.map((s) => this.meta[s].updatedById).filter((x): x is string => !!x);
    const staff = ids.length ? await this.prisma.staffUser.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    const names = new Map(staff.map((s) => [s.id, s.name]));
    return {
      ...this.catalog(),
      defaults: {
        economy: DEFAULT_ECONOMY.rules,
        packs: DEFAULT_ECONOMY.packs.map((p) => ({ ...p, totalCoins: packTotalCoins(p) })),
        plans: DEFAULT_ECONOMY.plans,
        gifts: DEFAULT_ECONOMY.gifts.map((g) => ({ ...g, gems: gemsFor(g, this.snap.rules) })),
      },
      groups: RULE_GROUPS,
      sections: Object.fromEntries(
        ECONOMY_SECTIONS.map((s) => {
          const m = this.meta[s];
          return [s, { ...m, updatedBy: m.updatedById ? (names.get(m.updatedById) ?? 'Someone') : null }];
        }),
      ),
    };
  }

  /**
   * Saves one section. `base` is the value the editor started from (for
   * rules: just the fields being changed); if someone else saved those in
   * the meantime the save is refused instead of silently overwriting them.
   */
  async update(section: string, value: unknown, base: unknown, staffId: string): Promise<{ section: EconomySection; changes: string[] }> {
    if (!isEconomySection(section)) throw AppError.notFound('Economy section');
    const out = await this.redis.withLock('economy-write', 5000, async () => {
      await this.reload();
      const current = this.snap[section];
      let next: unknown;
      if (section === 'rules') {
        const patch = this.parse(RulesPatchSchema, value) as Partial<EconomyRules>;
        if (base !== undefined) {
          const seen = this.parse(RulesPatchSchema, base) as Partial<EconomyRules>;
          const stale = Object.keys(patch).filter((k) => k in seen && !isDeepStrictEqual(seen[k as keyof EconomyRules], this.snap.rules[k as keyof EconomyRules]));
          if (stale.length) throw this.conflict();
        }
        next = this.parse(RulesSchema, { ...this.snap.rules, ...patch });
      } else {
        next = this.parse(LIST_SCHEMA[section], withoutDerived(value));
        if (base !== undefined && !isDeepStrictEqual(this.parse(LIST_SCHEMA[section], withoutDerived(base)), current)) throw this.conflict();
      }
      const changes = this.diff(section, current, next);
      if (!changes.length) return { section, changes };
      const json = next as Prisma.InputJsonValue;
      await this.prisma.appSetting.upsert({ where: { key: KEY(section) }, create: { key: KEY(section), value: json, updatedById: staffId }, update: { value: json, updatedById: staffId } });
      await this.reload();
      return { section, changes };
    });
    if (!out) throw new AppError(ErrorCode.CONFLICT, 'Someone else is saving prices right now. Try again in a moment.', HttpStatus.CONFLICT);
    if (out.changes.length) await this.announce();
    return out;
  }

  /** Back to the defaults in code for one section. */
  async reset(section: string): Promise<{ section: EconomySection; changes: string[] }> {
    if (!isEconomySection(section)) throw AppError.notFound('Economy section');
    const changes = this.diff(section, this.snap[section], DEFAULT_ECONOMY[section]);
    await this.prisma.appSetting.deleteMany({ where: { key: KEY(section) } });
    await this.reload();
    await this.announce();
    return { section, changes };
  }

  // ── internals ─────────────────────────────────────────────────────────────

  async reload(): Promise<void> {
    try {
      const rows = await this.prisma.appSetting.findMany({ where: { key: { in: ECONOMY_SECTIONS.map(KEY) } } });
      const byKey = new Map(rows.map((r) => [r.key, r]));
      const snap = { ...DEFAULT_ECONOMY } as EconomySnapshot;
      for (const s of ECONOMY_SECTIONS) {
        const row = byKey.get(KEY(s));
        this.meta[s] = { custom: !!row, updatedAt: row?.updatedAt.toISOString() ?? null, updatedById: row?.updatedById ?? null };
        if (!row) continue;
        // Rules saved before a new rule existed pick up its default.
        const parsed = s === 'rules' ? RulesSchema.safeParse({ ...DEFAULT_RULES, ...(row.value as object) }) : LIST_SCHEMA[s].safeParse(row.value);
        if (parsed.success) (snap as unknown as Record<string, unknown>)[s] = parsed.data;
        else this.logger.warn(`Stored economy section "${s}" is invalid; using defaults`);
      }
      this.snap = snap;
    } catch (e) {
      // Keep serving the last good values if the database blips.
      this.logger.error(`Could not load economy: ${(e as Error).message}`);
    }
  }

  private async announce(): Promise<void> {
    await this.redis.client.publish(CHANNEL, '1');
    this.realtime.toAll(ServerEvent.CatalogUpdated, { version: this.version });
  }

  private parse(schema: ZodTypeAny, value: unknown): unknown {
    const r = schema.safeParse(value);
    if (r.success) return r.data;
    const issue = r.error.issues[0];
    throw new AppError(ErrorCode.VALIDATION_FAILED, issue?.message ?? 'Invalid values', HttpStatus.BAD_REQUEST, { path: issue?.path ?? [], issues: r.error.issues.slice(0, 10).map((i) => ({ path: i.path, message: i.message })) });
  }

  private conflict(): AppError {
    return AppError.conflict('Someone changed these values since you opened them. Reload to see the latest, then try again.', ErrorCode.CONFLICT, { reason: 'stale' });
  }

  /** Human-readable list of what changed, for the audit log. */
  private diff(section: EconomySection, before: unknown, after: unknown): string[] {
    if (section === 'rules') {
      const a = before as EconomyRules;
      const b = after as EconomyRules;
      return RULE_FIELDS.filter((f) => !isDeepStrictEqual(a[f.key], b[f.key])).map((f) => `${f.key}: ${JSON.stringify(a[f.key])} → ${JSON.stringify(b[f.key])}`);
    }
    const a = new Map((before as { id: string }[]).map((x) => [x.id, x]));
    const b = new Map((after as { id: string }[]).map((x) => [x.id, x]));
    const out: string[] = [];
    for (const [id, x] of b) {
      const old = a.get(id);
      if (!old) out.push(`+${id}`);
      else if (!isDeepStrictEqual(old, x)) {
        const fields = Object.keys({ ...old, ...x }).filter((k) => !isDeepStrictEqual((old as Record<string, unknown>)[k], (x as Record<string, unknown>)[k]));
        out.push(`${id} ${fields.map((k) => `${k} ${JSON.stringify((old as Record<string, unknown>)[k])}→${JSON.stringify((x as Record<string, unknown>)[k])}`).join(', ')}`);
      }
    }
    for (const id of a.keys()) if (!b.has(id)) out.push(`−${id}`);
    const orderChanged = !out.length && [...a.keys()].join() !== [...b.keys()].join();
    if (orderChanged) out.push('order');
    return out;
  }
}
