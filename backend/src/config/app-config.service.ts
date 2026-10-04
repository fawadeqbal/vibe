import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Env } from './env.schema';

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

  list(key: 'CORS_ORIGINS' | 'GOOGLE_CLIENT_IDS' | 'APPLE_CLIENT_IDS' | 'STUN_URLS' | 'TURN_URLS'): string[] {
    return this.get(key)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
}
