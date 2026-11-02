import { MailProvider } from '../src/infra/mail/mail.provider';
import { SMTP_SETTING_KEY, SmtpConfig, SmtpSettingsService } from '../src/infra/mail/smtp-settings.service';
import { createTestApp, resetState, staffLogin, TestApp } from './helpers';

const SECRET = 'abcd efgh ijkl mnop';
const CLEAN = 'abcdefghijklmnop';

/** Admin → Settings → E-mail sending: the password goes in, never comes out. */
describe('SMTP settings', () => {
  let t: TestApp;
  let smtp: SmtpSettingsService;
  const sent: { from: string; to: string; subject: string }[] = [];
  const logins: SmtpConfig[] = [];
  beforeAll(async () => {
    t = await createTestApp();
    smtp = t.app.get(SmtpSettingsService);
    // A fake mail server: the right password is CLEAN; a wrong one is refused with an error that quotes it.
    smtp.makeTransport = (c: SmtpConfig) => ({
      verify: async () => {
        logins.push(c);
        if (c.pass !== CLEAN) throw new Error(`535 Username and Password not accepted for ${c.user} / ${c.pass}`);
        return true;
      },
      sendMail: async (m: { from: string; to: string; subject: string }) => void sent.push(m),
      close: () => undefined,
    }) as never;
  });
  beforeEach(async () => {
    await resetState(t);
    sent.splice(0);
    logins.splice(0);
    (smtp as unknown as { cached: unknown }).cached = null;
  });
  afterAll(() => t.close());

  const body = { host: 'smtp.gmail.com', port: 465, secure: true, user: 'team@vibe.test', from: 'Vibe <team@vibe.test>' };

  it('checks the login, stores it encrypted, and never returns or logs the password', async () => {
    const owner = await staffLogin(t, 'owner');
    expect((await t.http.get('/v1/admin/mail/smtp').set(owner.auth).expect(200)).body).toMatchObject({ source: 'none', passwordSet: false });

    // Wrong password: refused, nothing saved, and the error doesn't echo it.
    const bad = await t.http.put('/v1/admin/mail/smtp').set(owner.auth).send({ ...body, password: 'wrong-pass-123' }).expect(400);
    expect(bad.body.error.code).toBe('SMTP_LOGIN_FAILED');
    expect(JSON.stringify(bad.body)).not.toContain('wrong-pass-123');
    expect(await t.prisma.appSetting.findUnique({ where: { key: SMTP_SETTING_KEY } })).toBeNull();

    // Right password (with Google's spaces): saved.
    const ok = await t.http.put('/v1/admin/mail/smtp').set(owner.auth).send({ ...body, password: SECRET }).expect(200);
    expect(ok.body).toMatchObject({ source: 'admin', user: 'team@vibe.test', passwordSet: true });
    expect(JSON.stringify(ok.body)).not.toMatch(/abcd|password"/);
    expect(logins.at(-1)?.pass).toBe(CLEAN);

    const row = await t.prisma.appSetting.findUniqueOrThrow({ where: { key: SMTP_SETTING_KEY } });
    expect(JSON.stringify(row.value)).not.toContain(CLEAN);
    expect(JSON.stringify(row.value)).not.toContain('abcd');
    const audit = await t.prisma.auditLog.findMany({ where: { action: 'mail.smtp_changed' } });
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain('abcd');
    expect(audit[0].summary).toBe('team@vibe.test @ smtp.gmail.com:465 · new password');

    const view = (await t.http.get('/v1/admin/mail/smtp').set(owner.auth).expect(200)).body;
    expect(JSON.stringify(view)).not.toContain('abcd');
    expect(view).toMatchObject({ source: 'admin', host: 'smtp.gmail.com', passwordSet: true, updatedBy: owner.email });

    // Change the sender without retyping the password; a new login needs one.
    await t.http.put('/v1/admin/mail/smtp').set(owner.auth).send({ ...body, from: 'Vibe Team <team@vibe.test>' }).expect(200);
    expect(logins.at(-1)?.pass).toBe(CLEAN);
    await t.http.put('/v1/admin/mail/smtp').set(owner.auth).send({ ...body, user: 'other@vibe.test' }).expect(400);

    // Mail now goes out with these settings, at once.
    await t.app.get(MailProvider).send({ to: 'someone@vibe.test', subject: 'Hello', text: 'Hi' });
    expect(sent.at(-1)).toMatchObject({ from: 'Vibe Team <team@vibe.test>', to: 'someone@vibe.test', subject: 'Hello' });

    // Test e-mail goes to the staff member themselves.
    expect((await t.http.post('/v1/admin/mail/smtp/test').set(owner.auth).send({ to: 'attacker@evil.test' }).expect(200)).body).toEqual({ sentTo: owner.email });
    expect(sent.at(-1)).toMatchObject({ to: owner.email, subject: 'Vibe test e-mail' });
  });

  it('only people who can change settings see it', async () => {
    const viewer = await staffLogin(t, 'viewer');
    await t.http.get('/v1/admin/mail/smtp').set(viewer.auth).expect(403);
    await t.http.put('/v1/admin/mail/smtp').set(viewer.auth).send({ ...body, password: SECRET }).expect(403);
  });
});
