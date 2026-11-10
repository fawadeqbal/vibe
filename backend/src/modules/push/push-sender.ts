import { Logger } from '@nestjs/common';

import { GoogleAuth } from '../../integrations/google/google-auth';
import { FetchLike, ProviderHttp } from '../../integrations/core/provider-http';
import { ServiceAccountKey } from '../../integrations/core/secrets';

/**
 * Android channel / notification group. `engagement` (streaks, Vibe Hour,
 * win-back, recap) is capped per day; quiet hours hold back social,
 * engagement and inbox — messages and payments always go.
 */
export type PushCategory = 'messages' | 'social' | 'payments' | 'inbox' | 'engagement';

export interface PushMessage {
  title: string;
  body: string;
  /** Tells the app where to go when tapped (string values only — FCM rule). */
  data: Record<string, string>;
  /** Picks the Android channel. */
  category: PushCategory;
  /** Groups notifications that belong together (iOS thread: one chat's messages sit together). Never replaces. */
  collapseKey?: string;
  /**
   * Replaces the earlier notification with the same key (Android tag): only
   * for a newer state of the same thing (a ringing call → missed call, a
   * payment → paid). Everything else stacks until it's opened or cleared.
   */
  replaceKey?: string;
  /** Account and safety alerts, calls: go out even in quiet hours. */
  urgent?: boolean;
  /**
   * An incoming call: on Android a data-only, high-priority message that
   * wakes the app even when it's closed, so it can ring full screen (it
   * draws its own notification from `data`); dropped after `ttlSeconds`
   * (the call is over by then). iOS still gets a normal alert.
   */
  ring?: { ttlSeconds: number };
  /** Data-only (the app draws the notification itself), e.g. the missed call that stops its ringing. */
  dataOnly?: boolean;
}

/** ok = delivered to FCM; invalid = drop this token; retry = transient. */
export type PushResult = 'ok' | 'invalid' | 'retry';

export interface PushSender {
  readonly name: string;
  send(token: string, msg: PushMessage): Promise<PushResult>;
}

/** Dev: logs what would be sent. */
export class DevPushSender implements PushSender {
  readonly name = 'dev';
  private readonly logger = new Logger('push:dev');
  readonly sent: { token: string; msg: PushMessage }[] = [];

  async send(token: string, msg: PushMessage): Promise<PushResult> {
    this.sent.push({ token, msg });
    if (this.sent.length > 200) this.sent.shift();
    this.logger.debug(`[push] ${token.slice(0, 8)}… ${msg.title}: ${msg.body}`);
    return 'ok';
  }
}

/** Firebase Cloud Messaging HTTP v1 (Android and iOS through APNs). */
export class FcmPushSender implements PushSender {
  readonly name = 'fcm';
  private readonly http: ProviderHttp;

  constructor(
    private readonly projectId: string,
    private readonly account: ServiceAccountKey,
    private readonly auth: GoogleAuth,
    fetchImpl?: FetchLike,
  ) {
    this.http = new ProviderHttp('fcm', 'https://fcm.googleapis.com/v1', fetchImpl);
  }

  async send(token: string, msg: PushMessage): Promise<PushResult> {
    const access = await this.auth.accessToken(this.account, ['https://www.googleapis.com/auth/firebase.messaging']);
    const r = await this.http.request<{ error?: { status?: string; details?: { errorCode?: string }[] } }>(`/projects/${encodeURIComponent(this.projectId)}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}` },
      body: {
        message: msg.ring || msg.dataOnly
          ? {
              token,
              data: { ...msg.data, category: msg.category, title: msg.title, body: msg.body },
              android: { priority: 'HIGH', ...(msg.ring ? { ttl: `${Math.max(1, Math.round(msg.ring.ttlSeconds))}s` } : {}) },
              apns: { headers: { 'apns-priority': '10' }, payload: { aps: { alert: { title: msg.title, body: msg.body }, sound: 'default' } } },
            }
          : {
              token,
              notification: { title: msg.title, body: msg.body },
              data: { ...msg.data, category: msg.category },
              android: { priority: 'HIGH', notification: { channel_id: msg.category, ...(msg.replaceKey ? { tag: msg.replaceKey } : {}) } },
              apns: { payload: { aps: { sound: 'default', ...(msg.collapseKey ? { 'thread-id': msg.collapseKey } : {}) } } },
            },
      },
      acceptAnyStatus: true,
      timeoutMs: 10_000,
    });
    if (r.status < 300) return 'ok';
    const code = r.body?.error?.details?.find((d) => d.errorCode)?.errorCode ?? r.body?.error?.status;
    if (r.status === 404 || code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT' || code === 'SENDER_ID_MISMATCH') return 'invalid';
    return 'retry';
  }
}
