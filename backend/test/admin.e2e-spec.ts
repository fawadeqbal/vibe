import { randomUUID } from 'node:crypto';

import { totpAt, totpCounter } from '../src/common/utils/totp';
import { createTestApp, resetState, signUp, sleep, staffLogin, TestApp } from './helpers';

describe('admin panel API', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t);
  });
  afterAll(() => t.close());

  describe('staff sign-in', () => {
    it('locks an e-mail after repeated wrong passwords', async () => {
      const s = await staffLogin(t, 'viewer');
      for (let i = 0; i < 4; i++) {
        const r = await t.http.post('/v1/admin/auth/login').send({ email: s.email, password: 'wrong-password-1' }).expect(401);
        expect(r.body.error.code).toBe('INVALID_CREDENTIALS');
      }
      const locked = await t.http.post('/v1/admin/auth/login').send({ email: s.email, password: 'wrong-password-1' }).expect(429);
      expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
      // Even the right password waits out the lock.
      await t.http.post('/v1/admin/auth/login').send({ email: s.email, password: s.password }).expect(429);
    });

    it('unknown e-mails get the same answer as wrong passwords', async () => {
      const r = await t.http.post('/v1/admin/auth/login').send({ email: 'nobody@vibe.test', password: 'whatever-123' }).expect(401);
      expect(r.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('forces a password change before anything else', async () => {
      const s = await staffLogin(t, 'admin', { mustChangePassword: true });
      const blocked = await t.http.get('/v1/admin/users').set(s.auth).expect(403);
      expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
      await t.http.get('/v1/admin/auth/me').set(s.auth).expect(200);
      const weak = await t.http.post('/v1/admin/auth/password').set(s.auth).send({ currentPassword: s.password, newPassword: 'onlyletters' }).expect(400);
      expect(weak.body.error.code).toBe('VALIDATION_FAILED');
      await t.http.post('/v1/admin/auth/password').set(s.auth).send({ currentPassword: s.password, newPassword: 'A-new-pass-2026' }).expect(200);
      await t.http.get('/v1/admin/users').set(s.auth).expect(200);
    });

    it('two-factor: setup, challenge, no code replay, recovery codes', async () => {
      const s = await staffLogin(t, 'admin');
      const setup = await t.http.post('/v1/admin/auth/2fa/setup').set(s.auth).expect(200);
      expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
      await t.http.post('/v1/admin/auth/2fa/enable').set(s.auth).send({ code: '000000' }).expect(400);
      const enabled = await t.http.post('/v1/admin/auth/2fa/enable').set(s.auth).send({ code: totpAt(setup.body.secret, totpCounter()) }).expect(200);
      expect(enabled.body.recoveryCodes).toHaveLength(10);

      const first = await t.http.post('/v1/admin/auth/login').send({ email: s.email, password: s.password }).expect(200);
      expect(first.body).toEqual({ status: 'two_factor_required', challenge: expect.any(String) });
      const code = totpAt(setup.body.secret, totpCounter());
      const ok = await t.http.post('/v1/admin/auth/login/2fa').send({ challenge: first.body.challenge, code }).expect(200);
      expect(ok.body.me.twoFactorEnabled).toBe(true);

      // The same code can't be used twice.
      const again = await t.http.post('/v1/admin/auth/login').send({ email: s.email, password: s.password }).expect(200);
      const replay = await t.http.post('/v1/admin/auth/login/2fa').send({ challenge: again.body.challenge, code }).expect(401);
      expect(replay.body.error.code).toBe('TWO_FACTOR_INVALID');
      // A recovery code works exactly once.
      const rc = enabled.body.recoveryCodes[0];
      await t.http.post('/v1/admin/auth/login/2fa').send({ challenge: again.body.challenge, code: rc }).expect(200);
      const third = await t.http.post('/v1/admin/auth/login').send({ email: s.email, password: s.password }).expect(200);
      await t.http.post('/v1/admin/auth/login/2fa').send({ challenge: third.body.challenge, code: rc }).expect(401);
    });

    it('requires 2FA setup when the setting is on', async () => {
      const owner = await staffLogin(t, 'owner');
      // You can't require it while you don't have it yourself.
      await t.http.put('/v1/admin/settings/security.require2fa').set(owner.auth).send({ value: true }).expect(409);
      const setup = await t.http.post('/v1/admin/auth/2fa/setup').set(owner.auth).expect(200);
      await t.http.post('/v1/admin/auth/2fa/enable').set(owner.auth).send({ code: totpAt(setup.body.secret, totpCounter()) }).expect(200);
      await t.http.put('/v1/admin/settings/security.require2fa').set(owner.auth).send({ value: true }).expect(200);
      const s = await staffLogin(t, 'support');
      const r = await t.http.get('/v1/admin/users').set(s.auth).expect(403);
      expect(r.body.error.code).toBe('TWO_FACTOR_SETUP_REQUIRED');
      const me = await t.http.get('/v1/admin/auth/me').set(s.auth).expect(200);
      expect(me.body.twoFactorSetupRequired).toBe(true);
      await t.http.put('/v1/admin/settings/security.require2fa').set(owner.auth).send({ value: false }).expect(200);
      await t.http.get('/v1/admin/users').set(s.auth).expect(200);
    });

    it('app tokens and staff tokens are not interchangeable', async () => {
      const u = await signUp(t);
      const s = await staffLogin(t, 'owner');
      await t.http.get('/v1/admin/users').set(u.auth).expect(401);
      await t.http.get('/v1/me').set(s.auth).expect(401);
    });

    it('refresh rotates; parallel refreshes get the same pair; logout ends the session', async () => {
      const s = await staffLogin(t, 'viewer');
      const [a, b] = await Promise.all([
        t.http.post('/v1/admin/auth/refresh').send({ refreshToken: s.refresh }),
        t.http.post('/v1/admin/auth/refresh').send({ refreshToken: s.refresh }),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(b.body.refreshToken).toBe(a.body.refreshToken);
      const auth = { Authorization: `Bearer ${a.body.accessToken}` };
      await t.http.get('/v1/admin/auth/me').set(auth).expect(200);
      await t.http.post('/v1/admin/auth/logout').send({ refreshToken: a.body.refreshToken }).expect(200);
      // The access token stops working at once, not at expiry.
      await t.http.get('/v1/admin/auth/me').set(auth).expect(401);
    });

    it('disabling a person signs them out everywhere immediately', async () => {
      const owner = await staffLogin(t, 'owner');
      const s = await staffLogin(t, 'moderator');
      await t.http.get('/v1/admin/reports').set(s.auth).expect(200);
      await t.http.patch(`/v1/admin/staff/${s.id}`).set(owner.auth).send({ status: 'DISABLED' }).expect(200);
      await t.http.get('/v1/admin/reports').set(s.auth).expect(401);
      await t.http.post('/v1/admin/auth/login').send({ email: s.email, password: s.password }).expect(401);
    });
  });

  describe('permissions and roles', () => {
    it('each endpoint checks its permission', async () => {
      const viewer = await staffLogin(t, 'viewer');
      const u = await signUp(t);
      await t.http.get('/v1/admin/users').set(viewer.auth).expect(200);
      const r = await t.http.post(`/v1/admin/users/${u.id}/ban`).set(viewer.auth).send({ hours: 24, reason: 'test ban' }).expect(403);
      expect(r.body.error.details.missing).toEqual(['users.ban']);
      await t.http.get('/v1/admin/staff').set(viewer.auth).expect(403);
    });

    it('e-mails are masked without the contact-details permission', async () => {
      const u = await signUp(t);
      const mod = await staffLogin(t, 'moderator');
      const fin = await staffLogin(t, 'finance');
      const masked = await t.http.get(`/v1/admin/users/${u.id}`).set(mod.auth).expect(200);
      const full = await t.http.get(`/v1/admin/users/${u.id}`).set(fin.auth).expect(200);
      expect(masked.body.email).toMatch(/^u•••\d@vibe\.test$/);
      expect(full.body.email).toMatch(/^user\d+-\d+@vibe\.test$/);
    });

    it('role changes apply to signed-in people at once', async () => {
      const owner = await staffLogin(t, 'owner');
      const role = await t.http.post('/v1/admin/roles').set(owner.auth).send({ name: 'Analyst', permissions: ['dashboard.view'] }).expect(201);
      const invite = await t.http.post('/v1/admin/staff').set(owner.auth).send({ email: 'analyst@vibe.test', name: 'Ana', roleId: role.body.id }).expect(201);
      expect(invite.body.temporaryPassword).toMatch(/^\w{4}-\w{4}-\w{4}-\w{4}$/);
      const login = await t.http.post('/v1/admin/auth/login').send({ email: 'analyst@vibe.test', password: invite.body.temporaryPassword }).expect(200);
      const auth = { Authorization: `Bearer ${login.body.tokens.accessToken}` };
      await t.http.post('/v1/admin/auth/password').set(auth).send({ currentPassword: invite.body.temporaryPassword, newPassword: 'Analyst-pass-1' }).expect(200);
      await t.http.get('/v1/admin/dashboard/summary').set(auth).expect(200);
      await t.http.get('/v1/admin/users').set(auth).expect(403);
      await t.http.patch(`/v1/admin/roles/${role.body.id}`).set(owner.auth).send({ permissions: ['dashboard.view', 'users.view'] }).expect(200);
      await t.http.get('/v1/admin/users').set(auth).expect(200);
      // Roles with people in them can't be deleted; built-ins never.
      await t.http.delete(`/v1/admin/roles/${role.body.id}`).set(owner.auth).expect(409);
      const ownerRole = (await t.http.get('/v1/admin/roles').set(owner.auth)).body.find((r: { key: string }) => r.key === 'owner');
      await t.http.delete(`/v1/admin/roles/${ownerRole.id}`).set(owner.auth).expect(403);
    });

    it('nobody hands out more access than they have, and there is always an owner', async () => {
      const owner = await staffLogin(t, 'owner');
      const admin = await staffLogin(t, 'admin');
      const roles = (await t.http.get('/v1/admin/roles').set(owner.auth)).body as { id: string; key: string }[];
      const ownerRole = roles.find((r) => r.key === 'owner')!;
      await t.http.post('/v1/admin/staff').set(admin.auth).send({ email: 'x@vibe.test', name: 'Xavier', roleId: ownerRole.id }).expect(403);
      await t.http.patch(`/v1/admin/staff/${owner.id}`).set(admin.auth).send({ status: 'DISABLED' }).expect(403);
      await t.http.patch(`/v1/admin/staff/${owner.id}`).set(owner.auth).send({ status: 'DISABLED' }).expect(403); // yourself
    });

    it('built-in role list is complete', async () => {
      const owner = await staffLogin(t, 'owner');
      const roles = (await t.http.get('/v1/admin/roles').set(owner.auth)).body.map((r: { key: string }) => r.key);
      expect(roles).toEqual(expect.arrayContaining(['owner', 'admin', 'moderator', 'finance', 'support', 'viewer']));
      const catalog = await t.http.get('/v1/admin/permissions').set(owner.auth).expect(200);
      expect(catalog.body.length).toBeGreaterThan(5);
    });
  });

  describe('users', () => {
    it('search by name, e-mail and id', async () => {
      const owner = await staffLogin(t, 'owner');
      const u = await signUp(t, { name: 'Zainab Searchable' });
      const me = await t.http.get('/v1/me').set(u.auth);
      for (const q of ['searchable', me.body.email, me.body.email.split('@')[0], u.id]) {
        const r = await t.http.get('/v1/admin/users').query({ q }).set(owner.auth).expect(200);
        expect(r.body.items.map((x: { id: string }) => x.id)).toContain(u.id);
      }
    });

    it('cursor paging walks every user exactly once', async () => {
      const owner = await staffLogin(t, 'owner');
      for (let i = 0; i < 5; i++) await signUp(t, { name: 'Pager' });
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const r: { body: { items: { id: string }[]; nextCursor: string | null } } = await t.http
          .get('/v1/admin/users')
          .query({ q: 'Pager', limit: 2, ...(cursor ? { cursor } : {}) })
          .set(owner.auth)
          .expect(200);
        seen.push(...r.body.items.map((x) => x.id));
        cursor = r.body.nextCursor;
      } while (cursor);
      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
    });

    it('ban, unban and everything is audited', async () => {
      const mod = await staffLogin(t, 'moderator');
      const owner = await staffLogin(t, 'owner');
      const u = await signUp(t);
      const ban = await t.http.post(`/v1/admin/users/${u.id}/ban`).set(mod.auth).send({ hours: 48, reason: 'Spam in chat' }).expect(200);
      expect(new Date(ban.body.bannedUntil).getTime()).toBeGreaterThan(Date.now() + 47 * 3600_000);
      const detail = await t.http.get(`/v1/admin/users/${u.id}`).set(mod.auth).expect(200);
      expect(detail.body.bannedUntil).toBe(ban.body.bannedUntil);
      await t.http.post(`/v1/admin/users/${u.id}/unban`).set(mod.auth).send({ reason: 'Appeal accepted' }).expect(200);
      await sleep(100);
      const log = await t.http.get('/v1/admin/audit').query({ targetId: u.id }).set(owner.auth).expect(200);
      expect(log.body.items.map((e: { action: string }) => e.action)).toEqual(['user.unbanned', 'user.banned']);
      expect(log.body.items[1]).toMatchObject({ actorEmail: mod.email, summary: '48h: Spam in chat' });
    });

    it('wallet adjustments go through the ledger, once per key', async () => {
      const fin = await staffLogin(t, 'finance');
      const u = await signUp(t);
      const key = randomUUID();
      const body = { coins: 500, gems: 0, title: 'Sorry for the outage', reason: 'Ticket #123', idempotencyKey: key };
      const a = await t.http.post(`/v1/admin/users/${u.id}/wallet`).set(fin.auth).send(body).expect(200);
      const b = await t.http.post(`/v1/admin/users/${u.id}/wallet`).set(fin.auth).send(body).expect(200);
      expect(a.body).toMatchObject({ coins: 530, applied: true });
      expect(b.body).toMatchObject({ coins: 530, applied: false });
      const tooMuch = await t.http.post(`/v1/admin/users/${u.id}/wallet`).set(fin.auth).send({ ...body, coins: -10_000, idempotencyKey: randomUUID() }).expect(402);
      expect(tooMuch.body.error.code).toBe('INSUFFICIENT_COINS');
      const ledger = await t.http.get(`/v1/admin/users/${u.id}/ledger`).set(fin.auth).expect(200);
      expect(ledger.body.items[0]).toMatchObject({ kind: 'ADJUSTMENT', coins: 500, balanceCoins: 530, title: 'Sorry for the outage' });
      expect((await t.http.get('/v1/wallet').set(u.auth)).body.coins).toBe(530);
    });

    it('grant and revoke VIP', async () => {
      const fin = await staffLogin(t, 'finance');
      const u = await signUp(t);
      await t.http.post(`/v1/admin/users/${u.id}/vip`).set(fin.auth).send({ days: 7, reason: 'Influencer' }).expect(200);
      expect((await t.http.get('/v1/vip').set(u.auth)).body).toMatchObject({ active: true, renews: false });
      await t.http.delete(`/v1/admin/users/${u.id}/vip`).set(fin.auth).send({ reason: 'Ended' }).expect(200);
      expect((await t.http.get('/v1/vip').set(u.auth)).body.active).toBe(false);
    });

    it('notes, sign-out and delete', async () => {
      const owner = await staffLogin(t, 'owner');
      const u = await signUp(t);
      await t.http.post(`/v1/admin/users/${u.id}/notes`).set(owner.auth).send({ text: 'Called about refund' }).expect(201);
      expect((await t.http.get(`/v1/admin/users/${u.id}/notes`).set(owner.auth)).body[0].text).toBe('Called about refund');
      await t.http.post(`/v1/admin/users/${u.id}/sign-out`).set(owner.auth).expect(200);
      await t.http.post('/v1/auth/refresh').send({ refreshToken: u.refresh }).expect(401);
      await t.http.delete(`/v1/admin/users/${u.id}`).set(owner.auth).send({ reason: 'GDPR request' }).expect(200);
      expect((await t.http.get(`/v1/admin/users/${u.id}`).set(owner.auth)).body).toMatchObject({ status: 'DELETED', name: 'Deleted user' });
    });
  });

  describe('moderation', () => {
    it('queue by person, resolve with a ban closes all their reports', async () => {
      const mod = await staffLogin(t, 'moderator');
      const bad = await signUp(t, { name: 'Troll' });
      const r1 = await signUp(t);
      const r2 = await signUp(t);
      await t.http.post('/v1/reports').set(r1.auth).send({ userId: bad.id, reason: 'HARASSMENT' }).expect(201);
      await t.http.post('/v1/reports').set(r2.auth).send({ userId: bad.id, reason: 'SPAM' }).expect(201);
      const people = await t.http.get('/v1/admin/reports/by-person').set(mod.auth).expect(200);
      const row = people.body.items.find((p: { user: { id: string } }) => p.user.id === bad.id);
      expect(row).toMatchObject({ openReports: 2, reasons: { HARASSMENT: 1, SPAM: 1 } });
      const list = await t.http.get('/v1/admin/reports').query({ reportedId: bad.id }).set(mod.auth).expect(200);
      expect(list.body.items).toHaveLength(2);
      const detail = await t.http.get(`/v1/admin/reports/${list.body.items[0].id}`).set(mod.auth).expect(200);
      expect(detail.body.otherReports).toHaveLength(1);
      await t.http.post(`/v1/admin/reports/${list.body.items[0].id}/resolve`).set(mod.auth).send({ action: 'ban', hours: 72 }).expect(200);
      const open = await t.http.get('/v1/admin/reports').query({ reportedId: bad.id }).set(mod.auth).expect(200);
      expect(open.body.items).toHaveLength(0);
      expect((await t.http.get(`/v1/admin/users/${bad.id}`).set(mod.auth)).body.bannedUntil).not.toBeNull();
      await t.http.post(`/v1/admin/reports/${list.body.items[1].id}/resolve`).set(mod.auth).send({ action: 'dismiss' }).expect(409);
    });

    it('bulk dismiss', async () => {
      const mod = await staffLogin(t, 'moderator');
      const target = await signUp(t);
      const a = await signUp(t);
      const rep = await t.http.post('/v1/reports').set(a.auth).send({ userId: target.id, reason: 'OTHER', note: 'meh', block: false }).expect(201);
      const r = await t.http.post('/v1/admin/reports/resolve').set(mod.auth).send({ ids: [rep.body.id], action: 'dismiss' }).expect(200);
      expect(r.body.resolved).toBe(1);
      const stats = await t.http.get('/v1/admin/reports/stats').set(mod.auth).expect(200);
      expect(stats.body.dismissed7d).toBeGreaterThanOrEqual(1);
    });
  });

  describe('finance', () => {
    it('refund takes the coins back once', async () => {
      const fin = await staffLogin(t, 'finance');
      const u = await signUp(t);
      const buy = await t.http
        .post('/v1/payments/purchases')
        .set(u.auth)
        .set('Idempotency-Key', randomUUID())
        .send({ productType: 'COIN_PACK', productId: 'popular', method: 'GOOGLE_PLAY', receipt: `gp-${randomUUID()}` })
        .expect(201);
      expect((await t.http.get('/v1/wallet').set(u.auth)).body.coins).toBe(30 + 550);
      const list = await t.http.get('/v1/admin/purchases').query({ userId: u.id }).set(fin.auth).expect(200);
      expect(list.body.items[0]).toMatchObject({ id: buy.body.id, status: 'SUCCEEDED', usd: 4.99 });
      const r = await t.http.post(`/v1/admin/purchases/${buy.body.id}/refund`).set(fin.auth).send({ reason: 'Chargeback' }).expect(200);
      expect(r.body).toEqual({ coinsClawedBack: 550, coinsShortfall: 0 });
      expect((await t.http.get('/v1/wallet').set(u.auth)).body.coins).toBe(30);
      await t.http.post(`/v1/admin/purchases/${buy.body.id}/refund`).set(fin.auth).send({ reason: 'Again' }).expect(409);
      const detail = await t.http.get(`/v1/admin/purchases/${buy.body.id}`).set(fin.auth).expect(200);
      expect(detail.body.status).toBe('REFUNDED');
      expect(detail.body.ledger.map((e: { kind: string }) => e.kind)).toEqual(['PURCHASE', 'REFUND']);
    });

    it('large cash-outs wait for approval; approve pays, reject returns gems', async () => {
      const owner = await staffLogin(t, 'owner');
      await t.http.put('/v1/admin/settings/payouts.reviewAboveUsd').set(owner.auth).send({ value: 20 }).expect(200);
      const u = await signUp(t);
      await t.http.post(`/v1/admin/users/${u.id}/wallet`).set(owner.auth).send({ gems: 20_000, title: 'Test gems', reason: 'test', idempotencyKey: randomUUID() }).expect(200);
      const cash = (gems: number) => t.http.post('/v1/wallet/cashouts').set(u.auth).set('Idempotency-Key', randomUUID()).send({ gems, method: 'JAZZCASH', account: '03001234567' });
      const big = await cash(5000).expect(201); // $25 ≥ $20 → review
      expect(big.body.cashout.status).toBe('REVIEW');
      const queue = await t.http.get('/v1/admin/cashouts').query({ status: 'REVIEW' }).set(owner.auth).expect(200);
      expect(queue.body.items.map((c: { id: string }) => c.id)).toContain(big.body.cashout.id);
      await t.http.post(`/v1/admin/cashouts/${big.body.cashout.id}/approve`).set(owner.auth).expect(200);
      const paid = await t.http.get('/v1/admin/cashouts').query({ userId: u.id, status: 'PAID' }).set(owner.auth).expect(200);
      expect(paid.body.items).toHaveLength(1);

      const second = await cash(5000).expect(201);
      await t.http.post(`/v1/admin/cashouts/${second.body.cashout.id}/reject`).set(owner.auth).send({ reason: 'Name mismatch' }).expect(200);
      expect((await t.http.get('/v1/wallet').set(u.auth)).body.gems).toBe(15_000);
      await t.http.post(`/v1/admin/cashouts/${second.body.cashout.id}/approve`).set(owner.auth).expect(409);
      await t.http.put('/v1/admin/settings/payouts.reviewAboveUsd').set(owner.auth).send({ value: 100 }).expect(200);
    });

    it('summary and ledger explorer', async () => {
      const fin = await staffLogin(t, 'finance');
      const s = await t.http.get('/v1/admin/finance/summary').set(fin.auth).expect(200);
      expect(s.body.refundsCount).toBeGreaterThanOrEqual(1);
      expect(s.body.byMethod).toEqual(expect.any(Array));
      // Profit and loss adds up: gross − refunds − fees = net; net − payouts = profit.
      const b = s.body;
      const cents = (n: number) => Math.round(n * 100);
      expect(Math.abs(cents(b.grossUsd - b.refundsUsd - b.feesUsd - b.netUsd))).toBeLessThanOrEqual(1);
      expect(Math.abs(cents(b.netUsd - b.creatorPaidUsd - b.partnerPaidUsd - b.profitUsd))).toBeLessThanOrEqual(1);
      expect(Math.abs(cents(b.netUsd - b.earned.creatorUsd - b.earned.partnerUsd - b.earned.profitUsd))).toBeLessThanOrEqual(1);
      expect(b.creatorPaidUsd).toBeGreaterThanOrEqual(25); // the approved $25 cash-out above
      expect(b.grossUsd).toBeGreaterThanOrEqual(4.99); // the refunded purchase still counts as a sale, then as a refund
      expect(b.series).toHaveLength(30);
      expect(Math.abs(b.series.at(-1).cumulativeProfitUsd - b.profitUsd)).toBeLessThanOrEqual(0.05);
      expect(b.owed).toMatchObject({ gemsUsd: expect.any(Number), partnersUsd: expect.any(Number), totalUsd: expect.any(Number) });
      expect((await t.http.get('/v1/admin/finance/summary').query({ days: 7 }).set(fin.auth).expect(200)).body.series).toHaveLength(7);
      // Fee rates are staff-only.
      expect((await t.http.get('/v1/catalog').expect(200)).body.economy).not.toHaveProperty('storeFeeShare');
      const l = await t.http.get('/v1/admin/ledger').query({ kind: 'REFUND' }).set(fin.auth).expect(200);
      expect(l.body.items.every((e: { kind: string }) => e.kind === 'REFUND')).toBe(true);
    });
  });

  describe('operations', () => {
    it('maintenance mode pauses the app but not the panel', async () => {
      const owner = await staffLogin(t, 'owner');
      const u = await signUp(t);
      await t.http.put('/v1/admin/settings/maintenance.enabled').set(owner.auth).send({ value: true }).expect(200);
      const r = await t.http.get('/v1/wallet').set(u.auth).expect(503);
      expect(r.body.error.code).toBe('MAINTENANCE');
      expect((await t.http.get('/v1/config').expect(200)).body.maintenance.enabled).toBe(true);
      await t.http.get('/health/live').expect(200);
      await t.http.get('/v1/admin/users').set(owner.auth).expect(200);
      await t.http.put('/v1/admin/settings/maintenance.enabled').set(owner.auth).send({ value: false }).expect(200);
      await t.http.get('/v1/wallet').set(u.auth).expect(200);
    });

    it('settings are typed', async () => {
      const owner = await staffLogin(t, 'owner');
      const bad = await t.http.put('/v1/admin/settings/maintenance.enabled').set(owner.auth).send({ value: 'yes' }).expect(400);
      expect(bad.body.error.code).toBe('VALIDATION_FAILED');
      await t.http.put('/v1/admin/settings/nope').set(owner.auth).send({ value: 1 }).expect(404);
      const all = await t.http.get('/v1/admin/settings').set(owner.auth).expect(200);
      expect(all.body.find((s: { key: string }) => s.key === 'signups.enabled')).toMatchObject({ type: 'boolean', value: true });
    });

    it('closing sign-ups stops new accounts only', async () => {
      const owner = await staffLogin(t, 'owner');
      const google = (id: string) => t.http.post('/v1/auth/social').send({ provider: 'google', idToken: `dev:${id}:Existing` });
      await google('existing-1').expect(200);
      await t.http.put('/v1/admin/settings/signups.enabled').set(owner.auth).send({ value: false }).expect(200);
      try {
        const r = await google('brand-new-1').expect(403);
        expect(r.body.error.code).toBe('SIGNUPS_CLOSED');
        await google('existing-1').expect(200);
      } finally {
        await t.http.put('/v1/admin/settings/signups.enabled').set(owner.auth).send({ value: true }).expect(200);
      }
    });

    it('announcements: draft → publish → the app sees it → archive', async () => {
      const owner = await staffLogin(t, 'owner');
      const u = await signUp(t);
      const a = await t.http.post('/v1/admin/announcements').set(owner.auth).send({ title: 'New gifts!', body: 'Try the Rocket.' }).expect(201);
      expect((await t.http.get('/v1/announcements').set(u.auth)).body).toHaveLength(0);
      await t.http.post(`/v1/admin/announcements/${a.body.id}/publish`).set(owner.auth).expect(200);
      expect((await t.http.get('/v1/announcements').set(u.auth)).body[0]).toMatchObject({ title: 'New gifts!' });
      await t.http.patch(`/v1/admin/announcements/${a.body.id}`).set(owner.auth).send({ title: 'x' + 'y' }).expect(409);
      await t.http.post(`/v1/admin/announcements/${a.body.id}/archive`).set(owner.auth).expect(200);
      expect((await t.http.get('/v1/announcements').set(u.auth)).body).toHaveLength(0);
    });

    it('dashboard and live', async () => {
      const owner = await staffLogin(t, 'owner');
      const s = await t.http.get('/v1/admin/dashboard/summary').set(owner.auth).expect(200);
      expect(s.body.users.total).toBeGreaterThan(0);
      const series = await t.http.get('/v1/admin/dashboard/series').query({ days: 7 }).set(owner.auth).expect(200);
      expect(series.body).toHaveLength(7);
      expect(series.body[6].signups).toBeGreaterThan(0);
      const live = await t.http.get('/v1/admin/live').set(owner.auth).expect(200);
      expect(live.body).toMatchObject({ online: expect.any(Number), searching: expect.any(Number), calls: expect.any(Array) });
    });
  });
});
