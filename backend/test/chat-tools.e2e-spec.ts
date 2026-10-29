import type { Socket } from 'socket.io-client';

import { EconomyService } from '../src/modules/catalog/economy.service';
import { connect, createTestApp, next, resetState, signUp, sleep, TestApp, TestUser } from './helpers';

/** Chat tools: replies, reactions, unsend, photos, voice notes, typing, seen. */
describe('chat tools', () => {
  let t: TestApp;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    sockets.splice(0).forEach((s) => s.disconnect());
    await sleep(100);
    await resetState(t);
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await sleep(300);
    await t.close();
  });

  const online = async (u: TestUser) => {
    const s = await connect(t, u);
    sockets.push(s);
    return s;
  };
  const friends = async () => {
    const a = await signUp(t, { name: 'Asad' });
    const b = await signUp(t, { name: 'Bina' });
    const [low, high] = [a.id, b.id].sort();
    await t.prisma.friendship.create({ data: { userLowId: low, userHighId: high, requesterId: a.id, status: 'ACCEPTED' } });
    return { a, b };
  };
  const setRules = async (rules: Record<string, number>) => {
    await t.prisma.appSetting.update({ where: { key: 'economy.rules' }, data: { value: { vibeHourMinutes: 0, ...rules } } });
    await t.app.get(EconomyService).reload();
  };
  const say = async (from: TestUser, to: TestUser, text: string, replyToId?: string) =>
    (await t.http.post(`/v1/friends/${to.id}/messages`).set(from.auth).send({ text, ...(replyToId ? { replyToId } : {}) }).expect(201)).body;

  it('replies quote the message; reactions are one each and live; unsend clears it for both', async () => {
    const { a, b } = await friends();
    const sa = await online(a);
    const first = await say(a, b, 'road trip to Murree');
    const reply = await say(b, a, 'no way!', first.id);
    expect(reply.replyTo).toMatchObject({ id: first.id, fromMe: false, text: 'road trip to Murree' });

    const updated = next(sa, 'message:updated');
    const r = (await t.http.put(`/v1/friends/${a.id}/messages/${first.id}/reaction`).set(b.auth).send({ emoji: '❤️' }).expect(200)).body;
    expect(r.reactions).toEqual({ mine: '❤️', theirs: null });
    expect((await updated).reactions).toEqual({ mine: null, theirs: '❤️' });
    await t.http.put(`/v1/friends/${a.id}/messages/${first.id}/reaction`).set(b.auth).send({ emoji: 'hello' }).expect(400);
    // The same emoji again removes it.
    expect((await t.http.put(`/v1/friends/${a.id}/messages/${first.id}/reaction`).set(b.auth).send({ emoji: '❤️' }).expect(200)).body.reactions.mine).toBeNull();

    // Only your own messages, only within the window.
    await t.http.delete(`/v1/friends/${a.id}/messages/${first.id}`).set(b.auth).expect(403);
    const gone = (await t.http.delete(`/v1/friends/${b.id}/messages/${first.id}`).set(a.auth).expect(200)).body;
    expect(gone).toMatchObject({ unsent: true, text: '' });
    const list = (await t.http.get(`/v1/friends/${a.id}/messages`).set(b.auth).expect(200)).body.items;
    expect(list.find((m: { id: string }) => m.id === reply.id).replyTo).toMatchObject({ unsent: true, text: '' });

    await setRules({ chatUnsendMinutes: 0 });
    const late = await say(a, b, 'too late');
    await t.http.delete(`/v1/friends/${b.id}/messages/${late.id}`).set(a.auth).expect(409);
  });

  it('photos and voice notes are stored and sent; the admin switches turn them off', async () => {
    const { a, b } = await friends();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const photo = (
      await t.http.post(`/v1/friends/${b.id}/messages/media`).set(a.auth).field('kind', 'photo').field('w', '1').field('h', '1').attach('file', png, { filename: 'p.png', contentType: 'image/png' }).expect(201)
    ).body;
    expect(photo).toMatchObject({ kind: 'photo', text: '📷 Photo', meta: { w: 1, h: 1 } });
    expect(photo.meta.url).toMatch(/chat\//);

    const voice = (
      await t.http.post(`/v1/friends/${b.id}/messages/media`).set(a.auth).field('kind', 'voice').field('seconds', '14').attach('file', Buffer.from('fake-webm'), { filename: 'v.webm', contentType: 'audio/webm' }).expect(201)
    ).body;
    expect(voice).toMatchObject({ kind: 'voice', text: '🎤 Voice message', meta: { seconds: 14 } });
    await t.http.post(`/v1/friends/${b.id}/messages/media`).set(a.auth).field('kind', 'voice').field('seconds', '400').attach('file', Buffer.from('x'), { filename: 'v.webm', contentType: 'audio/webm' }).expect(400);
    await t.http.post(`/v1/friends/${b.id}/messages/media`).set(a.auth).field('kind', 'photo').attach('file', Buffer.from('x'), { filename: 'x.gif', contentType: 'image/gif' }).expect(415);

    await setRules({ chatPhotosEnabled: 0 });
    const off = await t.http.post(`/v1/friends/${b.id}/messages/media`).set(a.auth).field('kind', 'photo').attach('file', png, { filename: 'p.png', contentType: 'image/png' }).expect(403);
    expect(off.body.error.code).toBe('FEATURE_DISABLED');
  });

  it('typing and seen are pushed to the other person', async () => {
    const { a, b } = await friends();
    const sa = await online(a);
    const sb = await online(b);
    const typing = next(sb, 'chat:typing');
    await t.http.post(`/v1/friends/${b.id}/typing`).set(a.auth).expect(204);
    expect(await typing).toEqual({ friendId: a.id });

    await say(a, b, 'hey');
    const seen = next(sa, 'message:read');
    await t.http.post(`/v1/friends/${a.id}/read`).set(b.auth).expect(200);
    expect(await seen).toMatchObject({ friendId: b.id });
  });
});
