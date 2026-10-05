import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'node:net';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/utils/password';
import { SystemRolesSync } from '../src/modules/admin/core/admin-core.module';
import { EconomyService } from '../src/modules/catalog/economy.service';
import { SettingsService } from '../src/modules/settings/settings.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { RedisService } from '../src/infra/redis/redis.service';
import { configureApp } from '../src/main';

export interface TestApp {
  app: NestExpressApplication;
  http: ReturnType<typeof request>;
  url: string;
  prisma: PrismaService;
  redis: RedisService;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'], rawBody: true });
  await configureApp(app);
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpServer().address() as AddressInfo).port;
  const prisma = app.get(PrismaService);
  const redis = app.get(RedisService);
  return {
    app,
    http: request(app.getHttpServer()),
    url: `http://127.0.0.1:${port}`,
    prisma,
    redis,
    close: () => app.close(),
  };
}

/** Empties every table and the test Redis db between suites. */
export async function resetState(t: TestApp): Promise<void> {
  const tables = await t.prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await t.prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((x) => `"${x.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await t.redis.client.flushdb();
  await t.app.get(SystemRolesSync).sync();
  t.app.get(SettingsService).invalidate();
  await t.app.get(EconomyService).reload();
}

export interface TestStaff {
  id: string;
  email: string;
  password: string;
  token: string;
  refresh: string;
  auth: { Authorization: string };
}

let staffSeq = 0;

/** A ready-to-use staff member with the given built-in role (password already changed). */
export async function staffLogin(t: TestApp, roleKey = 'owner', opts: { mustChangePassword?: boolean } = {}): Promise<TestStaff> {
  const email = `staff${++staffSeq}-${roleKey}@vibe.test`;
  const password = 'Staff-pass-123';
  const role = await t.prisma.staffRole.findUniqueOrThrow({ where: { key: roleKey } });
  const s = await t.prisma.staffUser.create({ data: { email, name: `Staff ${staffSeq}`, passwordHash: await hashPassword(password), roleId: role.id, mustChangePassword: opts.mustChangePassword ?? false } });
  const res = await t.http.post('/v1/admin/auth/login').send({ email, password }).expect(200);
  const token = res.body.tokens.accessToken as string;
  return { id: s.id, email, password, token, refresh: res.body.tokens.refreshToken, auth: { Authorization: `Bearer ${token}` } };
}

export interface TestUser {
  id: string;
  token: string;
  refresh: string;
  auth: { Authorization: string };
}

let emailSeq = 0;

/** Signs up a fresh, ready-to-match user. */
export async function signUp(
  t: TestApp,
  profile: Partial<{ name: string; age: number; gender: 'male' | 'female' | 'other'; countryCode: string; bio: string; interests: string[]; avatarUrl: string }> = {},
  inviteCode?: string,
): Promise<TestUser> {
  const email = `user${++emailSeq}-${Date.now()}@vibe.test`;
  await t.http.post('/v1/auth/otp/request').send({ email }).expect(200);
  const res = await t.http.post('/v1/auth/otp/verify').send({ email, code: '1234', inviteCode }).expect(200);
  const user: TestUser = { id: res.body.user.id, token: res.body.tokens.accessToken, refresh: res.body.tokens.refreshToken, auth: { Authorization: `Bearer ${res.body.tokens.accessToken}` } };
  await t.http
    .patch('/v1/me')
    .set(user.auth)
    .send({ name: 'Tester', age: 24, gender: 'female', countryCode: 'PK', ...profile })
    .expect(200);
  return user;
}

export function connect(t: TestApp, u: TestUser): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(t.url, { auth: { token: u.token }, transports: ['websocket'], forceNew: true, reconnection: false });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

/** Emits with an ack and returns `data`, or throws the `{ code, message }` error. */
export function emit<T = unknown>(s: Socket, event: string, payload: unknown = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    s.timeout(5000).emit(event, payload, (err: Error | null, res: { ok: boolean; data?: T; error?: { code: string; message: string } }) => {
      if (err) return reject(err);
      if (res.ok) resolve(res.data as T);
      else reject(Object.assign(new Error(res.error?.message), { code: res.error?.code, details: (res.error as { details?: unknown })?.details }));
    });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test payloads are loosely typed
export function next<T = any>(s: Socket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    s.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Buys with the dev card gateway like a person would: start the purchase,
 * open the hosted page, press Pay (or Decline), then read the purchase.
 */
export async function payByCard(t: TestApp, auth: { Authorization: string }, body: object, action: 'pay' | 'decline' = 'pay') {
  const started = await t.http.post('/v1/payments/purchases').set(auth).set('Idempotency-Key', `card-${Math.random()}`).send({ ...body, method: 'CARD' }).expect(201);
  if (started.body.status !== 'REQUIRES_ACTION' || started.body.action?.type !== 'redirect') throw new Error(`Expected a card redirect, got ${JSON.stringify(started.body)}`);
  const path = new URL(started.body.action.url).pathname;
  await t.http.get(path).expect(200);
  await t.http.post(path).type('form').send({ action }).expect(303);
  return t.http.get(`/v1/payments/purchases/${started.body.id}`).set(auth).expect(200);
}
