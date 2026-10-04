import { Injectable, Logger } from '@nestjs/common';
import { createPublicKey, verify } from 'node:crypto';

import { RedisService } from '../../../infra/redis/redis.service';

/**
 * Confirms a rewarded ad was really watched before coins are paid.
 * Production (AdMob SSV): AdMob calls our webhook with a signed callback;
 * we verify it and remember the transaction id; the app then claims with
 * that id. Dev: any non-empty token is accepted.
 */
export abstract class AdVerifier {
  /** True once per token: a token can only pay out once. */
  abstract consume(userId: string, token: string): Promise<boolean>;
}

@Injectable()
export class DevAdVerifier extends AdVerifier {
  constructor(private readonly redis: RedisService) {
    super();
  }

  async consume(userId: string, token: string): Promise<boolean> {
    if (!token) return false;
    return (await this.redis.client.set(`ad:used:${userId}:${token}`, '1', 'EX', 86400 * 2, 'NX')) === 'OK';
  }
}

const ADMOB_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';

@Injectable()
export class AdMobAdVerifier extends AdVerifier {
  private readonly logger = new Logger(AdMobAdVerifier.name);
  private keys: Map<string, string> = new Map();
  private keysAt = 0;

  constructor(private readonly redis: RedisService) {
    super();
  }

  /** Called by the SSV webhook with the raw query string. */
  async acceptCallback(rawQuery: string): Promise<boolean> {
    const sigIndex = rawQuery.indexOf('&signature=');
    if (sigIndex < 0) return false;
    const message = rawQuery.slice(0, sigIndex);
    const params = new URLSearchParams(rawQuery);
    const signature = params.get('signature');
    const keyId = params.get('key_id');
    const txId = params.get('transaction_id');
    const userId = params.get('user_id');
    if (!signature || !keyId || !txId || !userId) return false;
    const pem = await this.key(keyId);
    if (!pem) return false;
    const ok = verify('sha256', Buffer.from(message), createPublicKey(pem), Buffer.from(signature, 'base64url'));
    if (ok) await this.redis.client.set(`ad:verified:${userId}:${txId}`, '1', 'EX', 86400);
    return ok;
  }

  async consume(userId: string, token: string): Promise<boolean> {
    return (await this.redis.client.del(`ad:verified:${userId}:${token}`)) === 1;
  }

  private async key(id: string): Promise<string | undefined> {
    if (Date.now() - this.keysAt > 24 * 3600_000 || !this.keys.has(id)) {
      try {
        const res = await fetch(ADMOB_KEYS_URL);
        const body = (await res.json()) as { keys: { keyId: number; pem: string }[] };
        this.keys = new Map(body.keys.map((k) => [String(k.keyId), k.pem]));
        this.keysAt = Date.now();
      } catch (e) {
        this.logger.warn(`Could not fetch AdMob keys: ${(e as Error).message}`);
      }
    }
    return this.keys.get(id);
  }
}
