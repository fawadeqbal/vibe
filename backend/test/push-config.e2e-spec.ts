import { generateKeyPairSync } from 'node:crypto';

import { GoogleAuth } from '../src/integrations/google/google-auth';
import { PUSH_SETTING_KEY, PushSettingsService } from '../src/modules/push/push-settings.service';
import { PushService } from '../src/modules/push/push.service';
import { createTestApp, resetState, signUp, staffLogin, TestApp } from './helpers';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const KEY = JSON.stringify({ type: 'service_account', project_id: 'vibe-test', private_key_id: 'abc', private_key: privateKey, client_email: 'push@vibe-test.iam.gserviceaccount.com', token_uri: 'https://oauth2.googleapis.com/token' });

/** Admin → Configuration → Push notifications: the Firebase key goes in, never comes out. */
describe('push configuration', () => {
  let t: TestApp;
  let fcmApiOn = true;
  const sends: { token: string; validateOnly: boolean }[] = [];
  beforeAll(async () => {
    t = await createTestApp();
    jest.spyOn(t.app.get(GoogleAuth), 'accessToken').mockResolvedValue('test-access-token');
    // A fake FCM: dry runs answer "invalid token" (API on) or 403 (API off); real sends succeed.
    t.app.get(PushSettingsService).fetchImpl = (async (_url: string, init: { body: string }) => {
      const b = JSON.parse(init.body) as { validate_only?: boolean; message: { token: string } };
      sends.push({ token: b.message.token, validateOnly: !!b.validate_only });
      if (!fcmApiOn) return new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED' } }), { status: 403 });
      if (b.validate_only) return new Response(JSON.stringify({ error: { status: 'INVALID_ARGUMENT' } }), { status: 400 });
      return new Response(JSON.stringify({ name: 'projects/vibe-test/messages/1' }), { status: 200 });
    }) as never;
  });
  beforeEach(async () => {
    await resetState(t);
    sends.splice(0);
    fcmApiOn = true;
    await t.app.get(PushSettingsService).remove();
  });
  afterAll(() => t.close());

  it('checks the key with Firebase, keeps it encrypted, and sends a test notification', async () => {
    const owner = await staffLogin(t, 'owner');
    const before = (await t.http.get('/v1/admin/config/push').set(owner.auth).expect(200)).body;
    expect(before).toMatchObject({ source: 'none', keySet: false, devices: { total: 0 } });

    await t.http.put('/v1/admin/config/push').set(owner.auth).send({ serviceAccountJson: '{"type":"nope"}' }).expect(400);
    fcmApiOn = false;
    const off = await t.http.put('/v1/admin/config/push').set(owner.auth).send({ serviceAccountJson: KEY }).expect(400);
    expect(off.body.error).toMatchObject({ code: 'PUSH_KEY_INVALID' });
    expect(off.body.error.message).toContain('Cloud Messaging API');
    fcmApiOn = true;

    const saved = (await t.http.put('/v1/admin/config/push').set(owner.auth).send({ serviceAccountJson: KEY }).expect(200)).body;
    expect(saved).toMatchObject({ source: 'admin', projectId: 'vibe-test', clientEmail: 'push@vibe-test.iam.gserviceaccount.com', keySet: true, mode: 'live' });
    for (const text of [JSON.stringify(saved), JSON.stringify((await t.prisma.appSetting.findUniqueOrThrow({ where: { key: PUSH_SETTING_KEY } })).value), JSON.stringify(await t.prisma.auditLog.findMany())]) {
      expect(text).not.toContain('PRIVATE KEY');
      expect(text).not.toContain(privateKey.slice(40, 80));
    }
    expect(t.app.get(PushService).mode).toBe('live');

    // A user with the app registers their phone; the test notification reaches it.
    const u = await signUp(t, { name: 'Sana' });
    const me = (await t.http.get('/v1/me').set(u.auth).expect(200)).body;
    await t.http.post('/v1/me/push-tokens').set(u.auth).send({ token: 'device-token-0123456789-abcdef', platform: 'android', appVersion: '0.1.6' }).expect(200);
    const test = (await t.http.post('/v1/admin/config/push/test').set(owner.auth).send({ user: me.email }).expect(200)).body;
    expect(test).toMatchObject({ user: { id: u.id }, devices: 1, delivered: 1, mode: 'live' });
    expect(sends.at(-1)).toEqual({ token: 'device-token-0123456789-abcdef', validateOnly: false });
    expect((await t.http.get('/v1/admin/config/push').set(owner.auth).expect(200)).body.devices).toMatchObject({ android: 1, total: 1 });

    // Turn it off again.
    expect((await t.http.delete('/v1/admin/config/push').set(owner.auth).expect(200)).body).toMatchObject({ source: 'none', keySet: false });
  });

  it('only people who can change settings', async () => {
    const viewer = await staffLogin(t, 'viewer');
    await t.http.get('/v1/admin/config/push').set(viewer.auth).expect(403);
    await t.http.put('/v1/admin/config/push').set(viewer.auth).send({ serviceAccountJson: KEY }).expect(403);
  });
});
