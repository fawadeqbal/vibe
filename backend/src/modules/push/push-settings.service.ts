import { HttpStatus, Injectable } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { SecretBox } from '../../common/utils/secret-box';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { FetchLike, ProviderHttp } from '../../integrations/core/provider-http';
import { ServiceAccountKey } from '../../integrations/core/secrets';
import { GoogleAuth } from '../../integrations/google/google-auth';

/** The AppSetting row with the Firebase server key (sealed; never returned). */
export const PUSH_SETTING_KEY = 'push.fcm';
const RELOAD_MS = 30_000;
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

interface Stored {
  projectId: string;
  clientEmail: string;
  /** The whole service-account JSON, AES-GCM sealed (DATA_ENCRYPTION_KEY, purpose "push"). */
  keySealed: string;
}

export interface PushConfig {
  projectId: string;
  account: ServiceAccountKey;
}

export interface PushSettingsView {
  /** admin = saved in Configuration; none = not set (the server file may still turn on test mode). */
  source: 'admin' | 'none';
  projectId: string | null;
  /** The service account's e-mail (not secret), so you can tell which key is in use. */
  clientEmail: string | null;
  keySet: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  devices: { android: number; ios: number; web: number; total: number; activeLast30Days: number };
}

/**
 * The Firebase server key, managed from Admin → Configuration → Push
 * notifications. Checked with Google before saving (the key signs in, and
 * the FCM API answers), sealed at rest, never returned or logged.
 */
@Injectable()
export class PushSettingsService {
  private readonly box: SecretBox;
  private cached: { cfg: PushConfig | null; at: number } | null = null;
  /** Swapped in tests. */
  fetchImpl?: FetchLike;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: GoogleAuth,
    config: AppConfig,
  ) {
    this.box = new SecretBox(config.dataKey('push'));
  }

  private async read(): Promise<{ s: Stored; updatedAt: Date; updatedById: string | null } | null> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: PUSH_SETTING_KEY } });
    const v = row?.value as Partial<Stored> | null | undefined;
    if (!row || !v?.projectId || !v.keySealed || !v.clientEmail) return null;
    return { s: v as Stored, updatedAt: row.updatedAt, updatedById: row.updatedById };
  }

  /** The saved Firebase settings, or null (re-read every 30 s; a save applies at once here). */
  async current(): Promise<PushConfig | null> {
    if (this.cached && Date.now() - this.cached.at < RELOAD_MS) return this.cached.cfg;
    let cfg: PushConfig | null = null;
    const r = await this.read();
    if (r) {
      try {
        cfg = { projectId: r.s.projectId, account: JSON.parse(this.box.open(r.s.keySealed)) as ServiceAccountKey };
      } catch {
        cfg = null;
      }
    }
    this.cached = { cfg, at: Date.now() };
    return cfg;
  }

  async view(): Promise<PushSettingsView> {
    const [r, byPlatform, active] = await Promise.all([
      this.read(),
      this.prisma.pushToken.groupBy({ by: ['platform'], _count: { _all: true } }),
      this.prisma.pushToken.count({ where: { lastSeenAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
    ]);
    const count = (p: string) => byPlatform.find((x) => x.platform === p)?._count._all ?? 0;
    const devices = { android: count('android'), ios: count('ios'), web: count('web'), total: byPlatform.reduce((n, x) => n + x._count._all, 0), activeLast30Days: active };
    if (!r) return { source: 'none', projectId: null, clientEmail: null, keySet: false, updatedAt: null, updatedBy: null, devices };
    const by = r.updatedById ? await this.prisma.staffUser.findUnique({ where: { id: r.updatedById }, select: { email: true } }) : null;
    return { source: 'admin', projectId: r.s.projectId, clientEmail: r.s.clientEmail, keySet: true, updatedAt: r.updatedAt.toISOString(), updatedBy: by?.email ?? null, devices };
  }

  /** Checks the key with Google, then saves it sealed. */
  async save(rawJson: string, staffId: string): Promise<PushSettingsView> {
    const account = parseKey(rawJson);
    const projectId = account.project_id!;
    await this.check(projectId, account);
    const value: Stored = { projectId, clientEmail: account.client_email, keySealed: this.box.seal(JSON.stringify(account)) };
    await this.prisma.appSetting.upsert({ where: { key: PUSH_SETTING_KEY }, create: { key: PUSH_SETTING_KEY, value: { ...value }, updatedById: staffId }, update: { value: { ...value }, updatedById: staffId } });
    this.cached = null;
    return this.view();
  }

  /** Turns push off (removes the saved key). */
  async remove(): Promise<PushSettingsView> {
    await this.prisma.appSetting.deleteMany({ where: { key: PUSH_SETTING_KEY } });
    this.cached = null;
    return this.view();
  }

  /**
   * 1) the key signs in to Google; 2) a dry-run send reaches FCM: a made-up
   * device answers "invalid token" when the API is on, "disabled" when not.
   */
  private async check(projectId: string, account: ServiceAccountKey): Promise<void> {
    let access: string;
    try {
      access = await this.auth.accessToken(account, [FCM_SCOPE]);
    } catch (e) {
      throw new AppError(ErrorCode.PUSH_KEY_INVALID, `Google didn't accept this key: ${short(e)}. Generate a new private key in Firebase → Project settings → Service accounts.`, HttpStatus.BAD_REQUEST);
    }
    const http = new ProviderHttp('fcm-check', 'https://fcm.googleapis.com/v1', this.fetchImpl);
    let r: { status: number; body?: { error?: { status?: string; message?: string } } };
    try {
      r = await http.request(`/projects/${encodeURIComponent(projectId)}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}` },
        body: { validate_only: true, message: { token: 'vibe-config-check', notification: { title: 'check', body: 'check' } } },
        acceptAnyStatus: true,
        timeoutMs: 10_000,
      });
    } catch (e) {
      throw new AppError(ErrorCode.PUSH_KEY_INVALID, `Couldn't reach Firebase: ${short(e)}`, HttpStatus.BAD_REQUEST);
    }
    if (r.status === 403 || r.body?.error?.status === 'PERMISSION_DENIED') {
      throw new AppError(
        ErrorCode.PUSH_KEY_INVALID,
        'Firebase refused: turn on "Firebase Cloud Messaging API (V1)" (Firebase → Project settings → Cloud Messaging), or check the key belongs to this project.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (r.status === 404) throw new AppError(ErrorCode.PUSH_KEY_INVALID, `Firebase project "${projectId}" was not found.`, HttpStatus.BAD_REQUEST);
    // 200 (shouldn't happen) or 400 INVALID_ARGUMENT for the made-up token: the key and the API work.
  }
}

/** Reads the service-account JSON Firebase downloads; refuses anything else. */
export function parseKey(raw: string): ServiceAccountKey {
  let k: Partial<ServiceAccountKey & { type: string }>;
  try {
    k = JSON.parse(raw.trim());
  } catch {
    throw new AppError(ErrorCode.VALIDATION_FAILED, 'That is not the JSON file from Firebase. Open the downloaded .json file and paste everything in it.', HttpStatus.BAD_REQUEST);
  }
  if (k.type !== 'service_account' || !k.project_id || !k.client_email || !k.private_key?.includes('PRIVATE KEY')) {
    throw new AppError(ErrorCode.VALIDATION_FAILED, 'This JSON is not a Firebase service-account key (Project settings → Service accounts → Generate new private key).', HttpStatus.BAD_REQUEST);
  }
  return k as ServiceAccountKey;
}

const short = (e: unknown) => ((e as Error)?.message ?? 'unknown error').replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, '[key]').slice(0, 160);
