import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock, MS } from '../../common/utils/clock';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { StorageProvider } from '../../infra/storage/storage.provider';
import { cleanImage, type CleanImage } from './clean-image';

/** Where a photo is going. */
/** Where a photo is going (selfie = a verification photo staff may review). */
export type ImagePlace = 'chat' | 'moment' | 'avatar' | 'selfie';

/** A photo was refused by the nudity filter. Moderation counts these as strikes. */
export const MEDIA_BLOCKED = 'safety.media-blocked';
export interface MediaBlockedEvent {
  userId: string;
  place: ImagePlace;
}

export interface NsfwThresholds {
  block: number;
  review: number;
  onError: 'block' | 'allow';
}

export type NsfwVerdict = 'ok' | 'review' | 'block' | 'unavailable';

/**
 * The policy, pure so it is unit-tested with plain numbers: refuse at or
 * above `block`, let through but flag at or above `review`. When the check
 * couldn't run, `onError` decides whether photos wait or go unchecked.
 */
export function decideNsfw(score: number | null, t: NsfwThresholds): NsfwVerdict {
  if (score == null || !Number.isFinite(score)) return t.onError === 'block' ? 'unavailable' : 'ok';
  if (score >= t.block) return 'block';
  if (score >= Math.min(t.review, t.block)) return 'review';
  return 'ok';
}

/** A photo that passed: store `buffer` (JPEG), then call `noteStored(key)`. */
export interface ScreenedImage extends CleanImage {
  score: number | null;
  /** Sent, but a moderator should look: record it once you know the storage key. */
  review: boolean;
}

const FLAG_DAYS = 30;

/**
 * Every photo a person uploads (chat, Moments, profile photo) goes through
 * here before it is stored: re-encoded so only pixels remain (no GPS, no
 * hidden data, no fake file types), then scored for nudity by vibe-face.
 *
 * Blocked photos are never stored publicly. A private copy is kept 30 days
 * as evidence, a MediaFlag shows it to moderators, and MEDIA_BLOCKED lets
 * moderation pause repeat senders (NSFW_STRIKES).
 */
@Injectable()
export class ImageSafetyService {
  private readonly log = new Logger(ImageSafetyService.name);
  /** Swapped in unit tests. */
  http: typeof fetch = (...a) => fetch(...a);
  timeoutMs = 10_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
    private readonly config: AppConfig,
    private readonly events: EventEmitter2,
    private readonly clock: Clock,
  ) {}

  private get thresholds(): NsfwThresholds {
    return { block: this.config.get('NSFW_BLOCK'), review: this.config.get('NSFW_REVIEW'), onError: this.config.get('NSFW_ON_ERROR') };
  }

  /** Re-encode and score a photo. Throws CONTENT_BLOCKED / SAFETY_CHECK_UNAVAILABLE; otherwise returns what to store. */
  async screen(userId: string, place: ImagePlace, refId: string, input: Buffer): Promise<ScreenedImage> {
    const img = await cleanImage(input, this.config.get('IMAGE_MAX_SIDE'));
    if (this.config.get('NSFW_FILTER') === 'off') return { ...img, score: null, review: false };

    const score = await this.score(img.buffer);
    const verdict = decideNsfw(score, this.thresholds);
    if (verdict === 'unavailable') {
      throw new AppError(ErrorCode.SAFETY_CHECK_UNAVAILABLE, "We can't check photos right now. Try again in a minute.", HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (verdict === 'block') {
      await this.recordBlocked(userId, place, refId, img.buffer, score!);
      throw new AppError(ErrorCode.CONTENT_BLOCKED, "This photo looks like it shows nudity, so it wasn't sent. Nudity isn't allowed on Vibe.", HttpStatus.UNPROCESSABLE_ENTITY);
    }
    return { ...img, score, review: verdict === 'review' };
  }

  /**
   * Checks a photo that is already stored (photo sweeper). Same re-encoding,
   * thresholds and evidence as `screen`, but never throws: the caller decides
   * what to take down. `unavailable` = the check couldn't run (try later);
   * `unreadable` = not an image we can open.
   */
  async judge(input: Buffer): Promise<{ verdict: NsfwVerdict | 'unreadable'; score: number | null; jpeg: Buffer | null }> {
    // Filter off = the check isn't running (callers treat it like a short outage, never as "passed").
    if (this.config.get('NSFW_FILTER') === 'off') return { verdict: 'unavailable', score: null, jpeg: null };
    let jpeg: Buffer;
    try {
      jpeg = (await cleanImage(input, this.config.get('IMAGE_MAX_SIDE'))).buffer;
    } catch {
      return { verdict: 'unreadable', score: null, jpeg: null };
    }
    const score = await this.score(jpeg);
    return { verdict: score == null ? 'unavailable' : decideNsfw(score, { ...this.thresholds, onError: 'block' }), score, jpeg };
  }

  /** After storing a photo that came back with `review: true`: show it to moderators. */
  async noteStored(userId: string, place: ImagePlace, refId: string, key: string, img: ScreenedImage): Promise<void> {
    if (!img.review || img.score == null) return;
    await this.prisma.mediaFlag
      .create({ data: { userId, place, refId, score: img.score, action: 'review', key } })
      .catch((e: Error) => this.log.warn(`media flag not saved: ${e.message}`));
  }

  /** vibe-face POST /nsfw → 0–1, or null when it can't be reached or answers nonsense. */
  async score(jpeg: Buffer): Promise<number | null> {
    const base = (this.config.get('NSFW_SERVICE_URL') ?? this.config.get('FACE_SERVICE_URL')).replace(/\/$/, '');
    try {
      const form = new FormData();
      form.append('image', new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }), 'photo.jpg');
      const res = await this.http(`${base}/nsfw`, { method: 'POST', body: form, signal: AbortSignal.timeout(this.timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { nsfw?: unknown };
      if (typeof body.nsfw !== 'number' || body.nsfw < 0 || body.nsfw > 1) throw new Error('bad answer');
      return body.nsfw;
    } catch (e) {
      this.log.error(`nudity check failed: ${(e as Error).message}`);
      return null;
    }
  }

  /** A refused photo: private evidence copy, a MediaFlag, and (unless `strike: false`) a strike. */
  async recordBlocked(userId: string, place: ImagePlace, refId: string, jpeg: Buffer, score: number, opts: { strike?: boolean } = {}): Promise<void> {
    const key = `flags/${userId}/${this.clock.now().getTime()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const stored = await this.storage.put(key, jpeg, 'image/jpeg', { private: true }).then(
      () => key,
      (e: Error) => {
        this.log.error(`blocked photo evidence not stored: ${e.message}`);
        return null;
      },
    );
    await this.prisma.mediaFlag
      .create({ data: { userId, place, refId, score, action: 'blocked', key: stored } })
      .catch((e: Error) => this.log.warn(`media flag not saved: ${e.message}`));
    this.log.warn(`Blocked a ${place} photo from ${userId} (nudity ${score.toFixed(2)})`);
    if (opts.strike !== false) this.events.emit(MEDIA_BLOCKED, { userId, place } satisfies MediaBlockedEvent);
  }

  /** Blocked photos in the strike window (moderation pauses at NSFW_STRIKES). */
  blockedSince(userId: string, days = this.config.get('NSFW_STRIKE_DAYS')): Promise<number> {
    return this.prisma.mediaFlag.count({ where: { userId, action: 'blocked', createdAt: { gte: new Date(this.clock.now().getTime() - days * MS.day) } } });
  }

  /** Flags and their private evidence are kept 30 days. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanup(): Promise<void> {
    const before = new Date(this.clock.now().getTime() - FLAG_DAYS * MS.day);
    const old = await this.prisma.mediaFlag.findMany({ where: { createdAt: { lt: before }, action: 'blocked', key: { not: null } }, select: { key: true } });
    for (const { key } of old) await this.storage.delete(key!, { private: true }).catch(() => undefined);
    await this.prisma.mediaFlag.deleteMany({ where: { createdAt: { lt: before } } });
  }
}
