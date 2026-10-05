import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Env, envSchema } from './env.schema';

const envKeys = envSchema.shape;

/** Typed access to validated env: `config.get('PORT')` is a number. */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }

  get isTest(): boolean {
    return this.get('NODE_ENV') === 'test';
  }

  /** Staff JWT secret (dev/test fall back to one derived from the app secret). */
  get staffJwtSecret(): string {
    return this.get('JWT_STAFF_SECRET') ?? `${this.get('JWT_ACCESS_SECRET')}::staff`;
  }

  get staffDataKey(): string {
    return this.get('STAFF_DATA_KEY') ?? this.staffJwtSecret;
  }

  /** Key for sealing personal data at rest; `purpose` keeps keys apart (payouts, identities…). */
  dataKey(purpose: string): string {
    return `${this.get('DATA_ENCRYPTION_KEY') ?? `${this.get('JWT_ACCESS_SECRET')}::data`}::${purpose}`;
  }

  /** The raw env, for integration status checks (which keys are set). */
  get env(): Record<string, unknown> {
    return (this.raw ??= this.collect());
  }

  private raw?: Record<string, unknown>;

  private collect(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(envKeys)) out[key] = this.config.get(key as keyof Env, { infer: true });
    return out;
  }

  /** A public URL on this API (webhook and return URLs to give providers). */
  url(path: string): string {
    return `${this.get('PUBLIC_URL').replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  list(key: 'CORS_ORIGINS' | 'GOOGLE_CLIENT_IDS' | 'APPLE_CLIENT_IDS' | 'STUN_URLS' | 'TURN_URLS' | 'ADMOB_AD_UNIT_IDS'): string[] {
    return this.get(key)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
}
