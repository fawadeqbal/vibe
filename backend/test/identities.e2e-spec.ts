import { createTestApp, resetState, TestApp } from './helpers';

/** Social sign-in with several providers per account (dev tokens: dev:<sub>:<name>:<verified email>). */
describe('identities', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t);
  });
  afterAll(() => t.close());

  const social = (provider: string, idToken: string, extra: Record<string, unknown> = {}) => t.http.post('/v1/auth/social').send({ provider, idToken, ...extra });

  it('lists the providers the app should show', async () => {
    const res = await t.http.get('/v1/auth/providers').expect(200);
    expect(res.body.providers).toEqual(['google', 'apple', 'facebook']);
  });

  it('a provider-verified e-mail links to the existing e-mail account', async () => {
    await t.http.post('/v1/auth/otp/request').send({ email: 'nadia@gmail.com' }).expect(200);
    const byEmail = await t.http.post('/v1/auth/otp/verify').send({ email: 'nadia@gmail.com', code: '1234' }).expect(200);
    const google = await social('google', 'dev:g-nadia:Nadia:nadia@gmail.com').expect(200);
    expect(google.body.isNew).toBe(false);
    expect(google.body.user.id).toBe(byEmail.body.user.id);
    const ids = await t.http.get('/v1/me/identities').set({ Authorization: `Bearer ${google.body.tokens.accessToken}` }).expect(200);
    expect(ids.body.email).toBe('nadia@gmail.com');
    expect(ids.body.identities.map((i: { provider: string }) => i.provider)).toEqual(['GOOGLE']);
  });

  it('new identity → new account with the e-mail; same identity → same account', async () => {
    const first = await social('apple', 'dev:a-omar:Omar:omar@icloud.com', { name: 'Omar' }).expect(200);
    expect(first.body.isNew).toBe(true);
    expect(first.body.user.email).toBe('omar@icloud.com');
    const again = await social('apple', 'dev:a-omar').expect(200);
    expect(again.body.isNew).toBe(false);
    expect(again.body.user.id).toBe(first.body.user.id);
  });

  it('links and unlinks providers, keeping at least one way to sign in', async () => {
    const u = await social('facebook', 'dev:fb-hina:Hina').expect(200);
    const auth = { Authorization: `Bearer ${u.body.tokens.accessToken}` };
    // Only Facebook, no e-mail: can't remove the last sign-in method.
    const last = await t.http.delete('/v1/me/identities/facebook').set(auth).expect(409);
    expect(last.body.error.code).toBe('CONFLICT');
    const linked = await t.http.post('/v1/me/identities').set(auth).send({ provider: 'google', idToken: 'dev:g-hina' }).expect(200);
    expect(linked.body.identities.map((i: { provider: string }) => i.provider).sort()).toEqual(['FACEBOOK', 'GOOGLE']);
    // Google now signs into the same account.
    const viaGoogle = await social('google', 'dev:g-hina').expect(200);
    expect(viaGoogle.body.user.id).toBe(u.body.user.id);
    await t.http.delete('/v1/me/identities/facebook').set(auth).expect(200);
    // An identity owned by someone else can't be linked.
    const other = await social('google', 'dev:g-other').expect(200);
    const taken = await t.http.post('/v1/me/identities').set({ Authorization: `Bearer ${other.body.tokens.accessToken}` }).send({ provider: 'google', idToken: 'dev:g-hina' }).expect(409);
    expect(taken.body.error.message).toMatch(/already linked/);
  });

  it('deleting the account removes its identities, so the login starts fresh', async () => {
    const u = await social('google', 'dev:g-gone:Gone').expect(200);
    await t.http.delete('/v1/me').set({ Authorization: `Bearer ${u.body.tokens.accessToken}` }).expect((r) => expect([200, 204]).toContain(r.status));
    expect(await t.prisma.authIdentity.count({ where: { userId: u.body.user.id } })).toBe(0);
    const fresh = await social('google', 'dev:g-gone').expect(200);
    expect(fresh.body.isNew).toBe(true);
    expect(fresh.body.user.id).not.toBe(u.body.user.id);
  });

  it('Apple web flow (Android) bounces back into the app', async () => {
    const r = await t.http.post('/v1/auth/apple/callback').type('form').send({ code: 'c1', id_token: 'tok', state: 's', junk: 'x' }).expect(303);
    expect(r.headers.location).toBe('intent://callback?code=c1&id_token=tok&state=s#Intent;package=com.pingcrood.vibe_app;scheme=signinwithapple;end');
  });
});
