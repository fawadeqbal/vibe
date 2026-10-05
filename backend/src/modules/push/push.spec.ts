import { GoogleAuth } from '../../integrations/google/google-auth';
import { FcmPushSender } from './push-sender';

describe('FCM sender', () => {
  const auth = { accessToken: async () => 'access' } as unknown as GoogleAuth;
  const sender = (status: number, body: unknown, seen?: { url?: string; body?: unknown }) =>
    new FcmPushSender('proj', { client_email: 'x', private_key: 'y' }, auth, async (url, init) => {
      if (seen) Object.assign(seen, { url, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    });
  const msg = { title: 'Hi', body: 'There', data: { route: 'chat' }, category: 'messages' as const, collapseKey: 'chat:1' };

  it('sends an HTTP v1 message with channel and thread grouping', async () => {
    const seen: { url?: string; body?: { message: Record<string, unknown> } } = {};
    expect(await sender(200, { name: 'm/1' }, seen as never).send('tok', msg)).toBe('ok');
    expect(seen.url).toBe('https://fcm.googleapis.com/v1/projects/proj/messages:send');
    expect(seen.body?.message).toMatchObject({ token: 'tok', notification: { title: 'Hi' }, data: { route: 'chat', category: 'messages' }, android: { notification: { channel_id: 'messages', tag: 'chat:1' } } });
  });

  it('dead tokens are reported as invalid, server trouble as retry', async () => {
    expect(await sender(404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }).send('tok', msg)).toBe('invalid');
    expect(await sender(400, { error: { status: 'INVALID_ARGUMENT' } }).send('tok', msg)).toBe('invalid');
    expect(await sender(503, { error: { status: 'UNAVAILABLE' } }).send('tok', msg)).toBe('retry');
  });
});
