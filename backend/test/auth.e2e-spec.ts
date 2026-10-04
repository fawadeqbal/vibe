import { MailProvider } from '../src/infra/mail/mail.provider';
import { createTestApp, resetState, signUp, TestApp } from './helpers';

describe('auth', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t);
  });
  afterAll(() => t.close());

  it('signs up with an e-mailed code and gets a wallet with the welcome bonus', async () => {
    await t.http.post('/v1/auth/otp/request').send({ email: ' Sara.Khan@Gmail.com ' }).expect(200);
    const res = await t.http.post('/v1/auth/otp/verify').send({ email: 'sara.khan@gmail.com', code: '1234' }).expect(200);
    expect(res.body.user.email).toBe('sara.khan@gmail.com');
    expect(res.body.isNew).toBe(true);
    expect(res.body.user.profileReady).toBe(false);
    const auth = { Authorization: `Bearer ${res.body.tokens.accessToken}` };
    const wallet = await t.http.get('/v1/wallet').set(auth).expect(200);
    expect(wallet.body.coins).toBe(30);

    // Signing in again finds the same account.
    await t.redis.client.del('otp:resend:sara.khan@gmail.com');
    await t.http.post('/v1/auth/otp/request').send({ email: 'SARA.KHAN@gmail.com' }).expect(200);
    const again = await t.http.post('/v1/auth/otp/verify').send({ email: 'Sara.Khan@gmail.com', code: '1234' }).expect(200);
    expect(again.body.isNew).toBe(false);
    expect(again.body.user.id).toBe(res.body.user.id);
  });

  it('rejects wrong codes with a stable error code and limits resends', async () => {
    await t.http.post('/v1/auth/otp/request').send({ email: 'wrong@vibe.test' }).expect(200);
    const bad = await t.http.post('/v1/auth/otp/verify').send({ email: 'wrong@vibe.test', code: '0000' }).expect(401);
    expect(bad.body.error.code).toBe('OTP_INVALID');
    expect(bad.body.error.details.attemptsLeft).toBe(4);
    const resend = await t.http.post('/v1/auth/otp/request').send({ email: 'wrong@vibe.test' }).expect(429);
    expect(resend.body.error.code).toBe('RATE_LIMITED');
  });

  it('validates input with field details', async () => {
    const res = await t.http.post('/v1/auth/otp/request').send({ email: 'not-an-email' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    await t.http.post('/v1/auth/otp/request').send({ phone: '+923001234567' }).expect(400); // phone sign-in is gone
  });

  it('e-mails the code: in the subject, the text and the HTML', async () => {
    const mail = t.app.get(MailProvider);
    const spy = jest.spyOn(mail, 'send');
    await t.http.post('/v1/auth/otp/request').send({ email: 'Mail.Check@Vibe.test' }).expect(200);
    expect(spy).toHaveBeenCalledTimes(1);
    const m = spy.mock.calls[0][0];
    expect(m.to).toBe('mail.check@vibe.test');
    expect(m.subject).toBe('1234 is your Vibe code');
    expect(m.text).toContain('1234');
    expect(m.html).toContain('>1234<');
    spy.mockRestore();
  });

  it('a failed send says so and can be retried at once', async () => {
    const mail = t.app.get(MailProvider);
    const spy = jest.spyOn(mail, 'send').mockRejectedValueOnce(new Error('SMTP down'));
    const r = await t.http.post('/v1/auth/otp/request').send({ email: 'retry@vibe.test' }).expect(503);
    expect(r.body.error.code).toBe('EMAIL_NOT_SENT');
    await t.http.post('/v1/auth/otp/request').send({ email: 'retry@vibe.test' }).expect(200); // no 30 s wait
    await t.http.post('/v1/auth/otp/verify').send({ email: 'retry@vibe.test', code: '1234' }).expect(200);
    spy.mockRestore();
  });

  it('requires a token for private routes', async () => {
    const res = await t.http.get('/v1/me').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const u = await signUp(t);
    const r1 = await t.http.post('/v1/auth/refresh').send({ refreshToken: u.refresh }).expect(200);
    expect(r1.body.tokens.refreshToken).not.toBe(u.refresh);
    // The old token was rotated: presenting it again is treated as theft.
    await t.http.post('/v1/auth/refresh').send({ refreshToken: u.refresh }).expect(401);
    // …and the new one died with the family.
    await t.http.post('/v1/auth/refresh').send({ refreshToken: r1.body.tokens.refreshToken }).expect(401);
  });

  it('dev social sign-in works and rejects junk tokens', async () => {
    const ok = await t.http.post('/v1/auth/social').send({ provider: 'google', idToken: 'dev:g-123:Ali' }).expect(200);
    expect(ok.body.user.name).toBe('Ali');
    const bad = await t.http.post('/v1/auth/social').send({ provider: 'apple', idToken: 'nope' }).expect(401);
    expect(bad.body.error.code).toBe('SOCIAL_TOKEN_INVALID');
  });

  it('blocks under-18 profiles', async () => {
    const u = await signUp(t);
    const res = await t.http.patch('/v1/me').set(u.auth).send({ age: 16 }).expect(403);
    expect(res.body.error.code).toBe('UNDERAGE');
  });
});
