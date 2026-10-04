import { MailMessage, MailProvider } from '../src/infra/mail/mail.provider';
import { CampaignWorker } from '../src/modules/messaging/campaign-worker.service';
import { unsubscribeToken } from '../src/modules/messaging/unsubscribe';
import { createTestApp, resetState, signUp, staffLogin, TestApp, TestUser } from './helpers';

describe('mail templates and messages', () => {
  let t: TestApp;
  let sent: MailMessage[];
  let spy: jest.SpyInstance;
  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t);
  });
  beforeEach(() => {
    sent = [];
    spy = jest.spyOn(t.app.get(MailProvider), 'send').mockImplementation(async (m) => void sent.push(m));
  });
  afterEach(() => spy.mockRestore());
  afterAll(() => t.close());

  const run = async () => {
    const w = t.app.get(CampaignWorker);
    // The interval may be mid-tick; wait until our tick actually runs.
    for (let i = 0; i < 20; i++) {
      await w.tick();
      const busy = await t.prisma.campaign.count({ where: { status: { in: ['QUEUED', 'SENDING'] } } });
      if (!busy) return;
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  const meOf = async (u: TestUser) => (await t.http.get('/v1/me').set(u.auth)).body;
  const FIELDS = ['subject', 'preheader', 'heading', 'body', 'highlight', 'buttonLabel', 'buttonUrl', 'footer'] as const;
  const fieldsOf = (tpl: Record<string, unknown>) => Object.fromEntries(FIELDS.map((k) => [k, tpl[k]]));

  describe('templates', () => {
    it('the sign-in e-mail uses the edited template; the code is required; reset restores it', async () => {
      const owner = await staffLogin(t, 'owner');
      const list = await t.http.get('/v1/admin/mail-templates').set(owner.auth).expect(200);
      expect(list.body.map((x: { key: string }) => x.key)).toEqual(expect.arrayContaining(['sign_in_code', 'general_message', 'service_notice']));
      const tpl = (await t.http.get('/v1/admin/mail-templates/sign_in_code').set(owner.auth).expect(200)).body;

      const noCode = await t.http.put('/v1/admin/mail-templates/sign_in_code').set(owner.auth).send({ ...fieldsOf(tpl), subject: 'Hello', highlight: '', body: 'Hi', footer: '', preheader: '' }).expect(400);
      expect(noCode.body.error.details.missing).toEqual(['code']);
      const unknown = await t.http.put('/v1/admin/mail-templates/sign_in_code').set(owner.auth).send({ ...fieldsOf(tpl), body: 'Hi {{nickname}}' }).expect(400);
      expect(unknown.body.error.details.unknown).toEqual(['nickname']);

      await t.http.put('/v1/admin/mail-templates/sign_in_code').set(owner.auth).send({ ...fieldsOf(tpl), subject: 'Vibe code: {{code}}', heading: 'Welcome back' }).expect(200);
      await t.http.post('/v1/auth/otp/request').send({ email: 'tpl@vibe.test' }).expect(200);
      expect(sent[0]).toMatchObject({ to: 'tpl@vibe.test', subject: 'Vibe code: 1234' });
      expect(sent[0].html).toContain('Welcome back');

      const reset = await t.http.post('/v1/admin/mail-templates/sign_in_code/reset').set(owner.auth).expect(200);
      expect(reset.body).toMatchObject({ subject: '{{code}} is your Vibe code', edited: false });
    });

    it('preview escapes HTML and reports placeholders; test e-mails go only to you', async () => {
      const owner = await staffLogin(t, 'owner');
      const p = await t.http
        .post('/v1/admin/mail-templates/preview')
        .set(owner.auth)
        .send({ fields: { subject: 'Hi {{name}}', heading: '<script>x</script>', body: '**Bold** and [a link](https://vibe.app)\n\nSecond', buttonLabel: 'Open', buttonUrl: 'javascript:alert(1)' }, unsubscribe: true })
        .expect(200);
      expect(p.body.subject).toBe('Hi Sara');
      expect(p.body.html).toContain('&lt;script&gt;');
      expect(p.body.html).toContain('<strong>Bold</strong>');
      expect(p.body.html).toContain('href="https://vibe.app"');
      expect(p.body.html).not.toContain('javascript:');
      expect(p.body.html).toContain('Stop e-mail updates');
      expect(p.body.variables).toEqual(['name']);

      const r = await t.http.post('/v1/admin/mail-templates/general_message/test').set(owner.auth).send({}).expect(200);
      expect(r.body.sentTo).toBe(owner.email);
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe(owner.email);
      expect(sent[0].subject).toBe('[Test] News from Vibe');
    });

    it('custom templates: create from another, edit, delete; built-ins cannot be deleted', async () => {
      const owner = await staffLogin(t, 'owner');
      const c = await t.http.post('/v1/admin/mail-templates').set(owner.auth).send({ name: 'Weekend promo', from: 'service_notice' }).expect(201);
      expect(c.body).toMatchObject({ key: 'weekend_promo', custom: true, usage: 'starter', subject: 'An update about your Vibe account' });
      await t.http.put('/v1/admin/mail-templates/weekend_promo').set(owner.auth).send({ ...fieldsOf(c.body), subject: 'VIP is 20% off', name: 'Weekend VIP promo' }).expect(200);
      const starters = await t.http.get('/v1/admin/mail-templates/starters').set(owner.auth).expect(200);
      expect(starters.body.find((x: { key: string }) => x.key === 'weekend_promo')).toMatchObject({ name: 'Weekend VIP promo', subject: 'VIP is 20% off' });
      await t.http.delete('/v1/admin/mail-templates/sign_in_code').set(owner.auth).expect(403);
      await t.http.delete('/v1/admin/mail-templates/weekend_promo').set(owner.auth).expect(200);
      await t.http.get('/v1/admin/mail-templates/weekend_promo').set(owner.auth).expect(404);
    });

    it('needs the template / messaging permissions', async () => {
      const viewer = await staffLogin(t, 'viewer');
      await t.http.get('/v1/admin/mail-templates').set(viewer.auth).expect(403);
      await t.http.post('/v1/admin/messages/audience').set(viewer.auth).send({ audience: 'ALL' }).expect(403);
    });
  });

  describe('messages', () => {
    it('picked people get it in the app and by e-mail, personalised, exactly once', async () => {
      const owner = await staffLogin(t, 'owner');
      const a = await signUp(t, { name: 'Amna' });
      const b = await signUp(t, { name: 'Bilal' });
      const msg = await t.http
        .post('/v1/admin/messages')
        .set(owner.auth)
        .send({ name: 'Hello test', audience: 'USERS', userIds: [a.id, b.id], sendEmail: true, sendInApp: true, subject: 'Hi {{name}}', heading: 'Hello {{name}}', body: 'Thanks for trying Vibe.', buttonLabel: 'Open', buttonUrl: 'https://vibe.app' })
        .expect(201);
      expect(msg.body).toMatchObject({ status: 'QUEUED', total: 2, pickedCount: 2 });
      sent.length = 0; // sign-up codes
      await run();
      await run(); // a second pass must not resend

      const done = (await t.http.get(`/v1/admin/messages/${msg.body.id}`).set(owner.auth).expect(200)).body;
      expect(done).toMatchObject({ status: 'SENT', processed: 2, emailSent: 2, inAppSent: 2, emailFailed: 0 });
      expect(sent.map((m) => m.subject).sort()).toEqual(['Hi Amna', 'Hi Bilal']);
      expect(sent[0].headers?.['List-Unsubscribe']).toMatch(/unsubscribe\?u=/);

      expect((await t.http.get('/v1/inbox/unread').set(a.auth).expect(200)).body.count).toBe(1);
      const inbox = await t.http.get('/v1/inbox').set(a.auth).expect(200);
      expect(inbox.body.items[0]).toMatchObject({ title: 'Hi Amna', body: 'Hello Amna\n\nThanks for trying Vibe.', buttonUrl: 'https://vibe.app', read: false });
      await t.http.post(`/v1/inbox/${inbox.body.items[0].id}/read`).set(a.auth).expect(200);
      expect((await t.http.get('/v1/inbox/unread').set(a.auth)).body.count).toBe(0);
      await t.http.post(`/v1/inbox/${inbox.body.items[0].id}/read`).set(b.auth).expect(404); // not theirs

      const deliveries = await t.http.get(`/v1/admin/messages/${msg.body.id}/deliveries`).set(owner.auth).expect(200);
      expect(deliveries.body.items).toHaveLength(2);
      expect(deliveries.body.items.every((d: { status: string }) => d.status === 'SENT')).toBe(true);
    });

    it('people who unsubscribed are skipped — unless it is an important notice', async () => {
      const owner = await staffLogin(t, 'owner');
      const optedOut = await signUp(t, { name: 'Quiet', countryCode: 'NG' });
      const keen = await signUp(t, { name: 'Keen', countryCode: 'NG' });
      // Unsubscribe link from an e-mail
      const bad = await t.http.get('/v1/email/unsubscribe').query({ u: optedOut.id, t: 'x'.repeat(20) }).expect(200);
      expect(bad.text).toContain('not valid');
      const ok = await t.http.get('/v1/email/unsubscribe').query({ u: optedOut.id, t: unsubscribeToken(optedOut.id, 'test-access-secret-that-is-long-enough-123') }).expect(200);
      expect(ok.text).toContain("won't get e-mail updates");
      expect((await meOf(optedOut)).marketingEmails).toBe(false);

      const audience = await t.http.post('/v1/admin/messages/audience').set(owner.auth).send({ audience: 'SEGMENT', segment: { countries: ['NG'] } }).expect(200);
      expect(audience.body).toMatchObject({ total: 2, email: 1, optedOut: 1, inApp: 2 });

      const base = { audience: 'SEGMENT', segment: { countries: ['NG'] }, sendEmail: true, sendInApp: false, subject: 'S', heading: 'H', body: 'B' };
      sent.length = 0;
      const news = await t.http.post('/v1/admin/messages').set(owner.auth).send({ ...base, name: 'News' }).expect(201);
      await run();
      expect(sent.map((m) => m.to)).toEqual([(await meOf(keen)).email]);
      expect((await t.http.get(`/v1/admin/messages/${news.body.id}`).set(owner.auth)).body).toMatchObject({ emailSent: 1, emailSkipped: 1 });

      sent.length = 0;
      await t.http.post('/v1/admin/messages').set(owner.auth).send({ ...base, name: 'Policy', important: true }).expect(201);
      await run();
      expect(sent).toHaveLength(2);
      expect(sent.every((m) => !m.html?.includes('Stop e-mail updates'))).toBe(true);

      // People can turn e-mail updates back on themselves.
      await t.http.patch('/v1/me').set(optedOut.auth).send({ marketingEmails: true }).expect(200);
      expect((await meOf(optedOut)).marketingEmails).toBe(true);
    });

    it('e-mail is paced by the per-minute setting and resumes where it stopped', async () => {
      const owner = await staffLogin(t, 'owner');
      const people = [await signUp(t, { countryCode: 'JP' }), await signUp(t, { countryCode: 'JP' }), await signUp(t, { countryCode: 'JP' })];
      await t.http.put('/v1/admin/settings/mail.perMinute').set(owner.auth).send({ value: 1 }).expect(200);
      await t.redis.client.del(`mail:rate:${Math.floor(Date.now() / 60_000)}`);
      sent.length = 0;
      const msg = await t.http.post('/v1/admin/messages').set(owner.auth).send({ name: 'Paced', audience: 'USERS', userIds: people.map((p) => p.id), sendEmail: true, sendInApp: false, subject: 'S', heading: 'H', body: 'B' }).expect(201);
      await t.app.get(CampaignWorker).tick();
      const mid = (await t.http.get(`/v1/admin/messages/${msg.body.id}`).set(owner.auth)).body;
      expect(mid.status).toBe('SENDING');
      expect(sent.length).toBeLessThanOrEqual(1);

      await t.http.put('/v1/admin/settings/mail.perMinute').set(owner.auth).send({ value: 60 }).expect(200);
      await t.redis.client.del(`mail:rate:${Math.floor(Date.now() / 60_000)}`);
      await run();
      const end = (await t.http.get(`/v1/admin/messages/${msg.body.id}`).set(owner.auth)).body;
      expect(end).toMatchObject({ status: 'SENT', emailSent: 3, processed: 3 });
      expect(new Set(sent.map((m) => m.to)).size).toBe(3);
    });

    it('everyone / validation / cancel', async () => {
      const owner = await staffLogin(t, 'owner');
      const all = await t.http.post('/v1/admin/messages/audience').set(owner.auth).send({ audience: 'ALL' }).expect(200);
      expect(all.body.total).toBe(await t.prisma.user.count({ where: { status: 'ACTIVE', isBot: false } }));
      await t.http.post('/v1/admin/messages').set(owner.auth).send({ name: 'xx', audience: 'ALL', sendEmail: false, sendInApp: false, subject: 'S', heading: 'H', body: 'B' }).expect(400);
      await t.http.post('/v1/admin/messages').set(owner.auth).send({ name: 'xx', audience: 'USERS', userIds: [], sendEmail: true, sendInApp: true, subject: 'S', heading: 'H', body: 'B' }).expect(400);
      const bad = await t.http.post('/v1/admin/messages').set(owner.auth).send({ name: 'xx', audience: 'ALL', sendEmail: true, sendInApp: true, subject: 'S {{nickname}}', heading: 'H', body: 'B' }).expect(400);
      expect(bad.body.error.message).toContain('{{nickname}}');

      const spy2 = jest.spyOn(t.app.get(CampaignWorker), 'tick').mockResolvedValue(undefined); // keep it queued
      const q = await t.http.post('/v1/admin/messages').set(owner.auth).send({ name: 'Oops', audience: 'ALL', sendEmail: false, sendInApp: true, subject: 'S', heading: 'H', body: 'B' }).expect(201);
      const c = await t.http.post(`/v1/admin/messages/${q.body.id}/cancel`).set(owner.auth).expect(200);
      expect(c.body.status).toBe('CANCELED');
      spy2.mockRestore();
      await t.http.post(`/v1/admin/messages/${q.body.id}/cancel`).set(owner.auth).expect(409);
      const list = await t.http.get('/v1/admin/messages').set(owner.auth).expect(200);
      expect(list.body.items[0]).toMatchObject({ name: 'Oops', status: 'CANCELED', createdBy: expect.any(String) });
    });
  });
});
