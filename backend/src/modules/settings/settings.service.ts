import { HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type Redis from 'ioredis';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { defaultFor, isSettingKey, SETTING_KEYS, SettingKey, SETTINGS, SettingsSnapshot, SettingValue } from './settings.registry';

const CHANNEL = 'settings:changed';
const TTL_MS = 30_000;

/**
 * Runtime settings, read on hot paths (every request checks maintenance
 * mode), so they are served from memory. Each instance reloads at most every
 * 30 s, and immediately when any instance publishes a change on Redis.
 */
@Injectable()
export class SettingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SettingsService.name);
  private cache: SettingsSnapshot | null = null;
  private loadedAt = 0;
  private loading: Promise<SettingsSnapshot> | null = null;
  private sub?: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: AppConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    this.sub = this.redis.create('settings-sub');
    await this.sub.subscribe(CHANNEL);
    this.sub.on('message', () => this.invalidate());
  }

  async onModuleDestroy(): Promise<void> {
    await this.sub?.quit().catch(() => undefined);
  }

  invalidate(): void {
    this.loadedAt = 0;
  }

  async all(): Promise<SettingsSnapshot> {
    if (this.cache && Date.now() - this.loadedAt < TTL_MS) return this.cache;
    this.loading ??= this.load().finally(() => (this.loading = null));
    return this.loading;
  }

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    return (await this.all())[key];
  }

  /** Validates, stores, and tells every instance. Returns the new value. */
  async set<K extends SettingKey>(key: string, value: unknown, staffId: string): Promise<{ key: K; value: SettingValue<K>; previous: SettingValue<K> }> {
    if (!isSettingKey(key)) throw AppError.notFound('Setting');
    const parsed = SETTINGS[key].schema.safeParse(value);
    if (!parsed.success) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, parsed.error.issues[0]?.message ?? 'Invalid value', HttpStatus.BAD_REQUEST, { key });
    }
    const previous = (await this.all())[key];
    const json = parsed.data as Prisma.InputJsonValue;
    await this.prisma.appSetting.upsert({ where: { key }, create: { key, value: json, updatedById: staffId }, update: { value: json, updatedById: staffId } });
    this.invalidate();
    await this.redis.client.publish(CHANNEL, key);
    return { key: key as K, value: parsed.data as SettingValue<K>, previous: previous as SettingValue<K> };
  }

  /** Definitions + current values + who changed them last, for the admin panel. */
  async describe() {
    const [values, rows] = await Promise.all([this.all(), this.prisma.appSetting.findMany()]);
    const meta = new Map(rows.map((r) => [r.key, r]));
    return SETTING_KEYS.map((key) => {
      const def = SETTINGS[key];
      const schema = def.schema as unknown as { _def: { typeName: string } };
      return {
        key,
        group: def.group,
        label: def.label,
        description: def.description,
        type: schema._def.typeName === 'ZodBoolean' ? 'boolean' : schema._def.typeName === 'ZodNumber' ? 'number' : 'string',
        value: values[key],
        default: defaultFor(key, this.config.isProduction),
        updatedAt: meta.get(key)?.updatedAt.toISOString() ?? null,
        updatedById: meta.get(key)?.updatedById ?? null,
      };
    });
  }

  private async load(): Promise<SettingsSnapshot> {
    const rows = await this.prisma.appSetting.findMany();
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    const out = {} as Record<SettingKey, unknown>;
    for (const key of SETTING_KEYS) {
      const raw = stored.get(key);
      const parsed = raw === undefined ? null : SETTINGS[key].schema.safeParse(raw);
      if (parsed && !parsed.success) this.logger.warn(`Setting ${key} has an invalid stored value; using default`);
      out[key] = parsed?.success ? parsed.data : defaultFor(key, this.config.isProduction);
    }
    this.cache = out as SettingsSnapshot;
    this.loadedAt = Date.now();
    return this.cache;
  }
}
