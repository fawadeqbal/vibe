import { EventEmitter2 } from '@nestjs/event-emitter';
import sharp from 'sharp';

import { ErrorCode } from '../../common/errors/error-codes';
import type { Clock } from '../../common/utils/clock';
import type { AppConfig } from '../../config/app-config.service';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { StorageProvider } from '../../infra/storage/storage.provider';
import { decideNsfw, ImageSafetyService, MEDIA_BLOCKED } from './image-safety.service';

const T = { block: 0.85, review: 0.6, onError: 'block' as const };

describe('decideNsfw', () => {
  it('blocks at the block line, flags between review and block, lets the rest through', () => {
    expect(decideNsfw(0.97, T)).toBe('block');
    expect(decideNsfw(0.85, T)).toBe('block');
    expect(decideNsfw(0.84, T)).toBe('review');
    expect(decideNsfw(0.6, T)).toBe('review');
    expect(decideNsfw(0.59, T)).toBe('ok');
    expect(decideNsfw(0, T)).toBe('ok');
  });

  it('when the check is down: wait (block) or go unchecked (allow)', () => {
    expect(decideNsfw(null, T)).toBe('unavailable');
    expect(decideNsfw(Number.NaN, T)).toBe('unavailable');
    expect(decideNsfw(null, { ...T, onError: 'allow' })).toBe('ok');
  });

  it('a review line above the block line never lets a blockable photo through', () => {
    expect(decideNsfw(0.9, { ...T, review: 0.95 })).toBe('block');
    expect(decideNsfw(0.86, { block: 0.85, review: 0.9, onError: 'block' })).toBe('block');
  });
});

describe('ImageSafetyService', () => {
  const env: Record<string, unknown> = {
    NSFW_FILTER: 'on',
    NSFW_SERVICE_URL: undefined,
    FACE_SERVICE_URL: 'http://vibe-face:8000/',
    NSFW_BLOCK: 0.85,
    NSFW_REVIEW: 0.6,
    NSFW_ON_ERROR: 'block',
    NSFW_STRIKE_DAYS: 30,
    IMAGE_MAX_SIDE: 1600,
  };
  let jpeg: Buffer;
  let flags: { create: jest.Mock; count: jest.Mock; findMany: jest.Mock; deleteMany: jest.Mock };
  let storage: { put: jest.Mock; delete: jest.Mock };
  let events: EventEmitter2;
  let svc: ImageSafetyService;
  let calls: string[];

  const answer = (body: unknown, status = 200) => {
    svc.http = jest.fn(async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
  };

  beforeAll(async () => {
    jpeg = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#888' } })
      .jpeg()
      .toBuffer();
  });

  beforeEach(() => {
    calls = [];
    flags = { create: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) };
    storage = { put: jest.fn(async (key: string) => key), delete: jest.fn().mockResolvedValue(undefined) };
    events = new EventEmitter2();
    const config = { get: (k: string) => env[k] } as unknown as AppConfig;
    const clock = { now: () => new Date('2026-11-09T10:00:00Z') } as unknown as Clock;
    svc = new ImageSafetyService({ mediaFlag: flags } as unknown as PrismaService, storage as unknown as StorageProvider, config, events, clock);
  });

  it('passes an ordinary photo, re-encoded, after asking vibe-face', async () => {
    answer({ nsfw: 0.02 });
    const out = await svc.screen('u1', 'chat', 'f1', jpeg);
    expect(calls).toEqual(['http://vibe-face:8000/nsfw']);
    expect(out).toMatchObject({ mime: 'image/jpeg', score: 0.02, review: false });
    expect(flags.create).not.toHaveBeenCalled();
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('blocks nudity: private evidence, a flag, a strike event, and a clear error', async () => {
    answer({ nsfw: 0.93 });
    const strikes: unknown[] = [];
    events.on(MEDIA_BLOCKED, (e) => strikes.push(e));

    await expect(svc.screen('u1', 'moment', 'k1', jpeg)).rejects.toMatchObject({ code: ErrorCode.CONTENT_BLOCKED, status: 422 });
    expect(storage.put).toHaveBeenCalledWith(expect.stringMatching(/^flags\/u1\/.+\.jpg$/), expect.any(Buffer), 'image/jpeg', { private: true });
    expect(flags.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'u1', place: 'moment', refId: 'k1', score: 0.93, action: 'blocked', key: expect.stringMatching(/^flags\/u1\//) }) });
    expect(strikes).toEqual([{ userId: 'u1', place: 'moment' }]);
  });

  it('still blocks (and records it) when the evidence copy cannot be stored', async () => {
    answer({ nsfw: 0.99 });
    storage.put.mockRejectedValueOnce(new Error('bucket down'));
    await expect(svc.screen('u1', 'chat', 'f1', jpeg)).rejects.toMatchObject({ code: ErrorCode.CONTENT_BLOCKED });
    expect(flags.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'blocked', key: null }) });
  });

  it('lets borderline photos through but records them for review once stored', async () => {
    answer({ nsfw: 0.7 });
    const out = await svc.screen('u1', 'avatar', 'u1', jpeg);
    expect(out.review).toBe(true);
    await svc.noteStored('u1', 'avatar', 'u1', 'avatars/u1/1.jpg', out);
    expect(flags.create).toHaveBeenCalledWith({ data: { userId: 'u1', place: 'avatar', refId: 'u1', score: 0.7, action: 'review', key: 'avatars/u1/1.jpg' } });
  });

  it('refuses photos while the check is down, unless NSFW_ON_ERROR=allow', async () => {
    answer({ error: 'boom' }, 500);
    await expect(svc.screen('u1', 'chat', 'f1', jpeg)).rejects.toMatchObject({ code: ErrorCode.SAFETY_CHECK_UNAVAILABLE, status: 503 });

    answer({ nsfw: 'yes' });
    await expect(svc.screen('u1', 'chat', 'f1', jpeg)).rejects.toMatchObject({ code: ErrorCode.SAFETY_CHECK_UNAVAILABLE });

    env.NSFW_ON_ERROR = 'allow';
    try {
      answer({}, 502);
      await expect(svc.screen('u1', 'chat', 'f1', jpeg)).resolves.toMatchObject({ score: null, review: false });
    } finally {
      env.NSFW_ON_ERROR = 'block';
    }
  });

  it('NSFW_FILTER=off still re-encodes but never calls vibe-face', async () => {
    answer({ nsfw: 1 });
    env.NSFW_FILTER = 'off';
    try {
      const out = await svc.screen('u1', 'chat', 'f1', jpeg);
      expect(out.mime).toBe('image/jpeg');
      expect(calls).toEqual([]);
    } finally {
      env.NSFW_FILTER = 'on';
    }
  });

  it('rejects non-images before spending a model call', async () => {
    answer({ nsfw: 0 });
    await expect(svc.screen('u1', 'chat', 'f1', Buffer.from('GIF89a....'))).rejects.toMatchObject({ status: 415 });
    expect(calls).toEqual([]);
  });

  it('cleanup deletes 30-day-old flags and their private evidence', async () => {
    flags.findMany.mockResolvedValue([{ key: 'flags/u1/a.jpg' }, { key: 'flags/u2/b.jpg' }]);
    await svc.cleanup();
    expect(storage.delete).toHaveBeenCalledWith('flags/u1/a.jpg', { private: true });
    expect(storage.delete).toHaveBeenCalledWith('flags/u2/b.jpg', { private: true });
    expect(flags.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date('2026-10-10T10:00:00Z') } } });
  });
});
