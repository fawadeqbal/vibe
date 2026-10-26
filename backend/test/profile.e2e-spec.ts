import { createTestApp, resetState, signUp, TestApp } from './helpers';

/** Profile fields that only describe you: what you're here for. */
describe('profile intent', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t);
  });
  afterAll(() => t.close());

  it('is optional, set with PATCH /me, cleared with null, and shown to others', async () => {
    const a = await signUp(t, { name: 'Hira' });
    const b = await signUp(t, { name: 'Omar' });
    expect((await t.http.get('/v1/me').set(a.auth).expect(200)).body.intent).toBeNull();

    const set = await t.http.patch('/v1/me').set(a.auth).send({ intent: 'friends' }).expect(200);
    expect(set.body.intent).toBe('friends');
    // Other fields are untouched by an intent-only update.
    expect(set.body.name).toBe('Hira');

    const seen = await t.http.get(`/v1/users/${a.id}`).set(b.auth).expect(200);
    expect(seen.body.intent).toBe('friends');

    await t.http.patch('/v1/me').set(a.auth).send({ intent: 'marriage' }).expect(400);
    expect((await t.http.patch('/v1/me').set(a.auth).send({ intent: null }).expect(200)).body.intent).toBeNull();
  });

  it('does not count towards the complete-profile bonus', async () => {
    const u = await signUp(t, {
      bio: 'hi',
      interests: ['Music', 'Travel', 'Coffee'],
      avatarUrl: 'https://i.pravatar.cc/400?img=5',
    });
    expect((await t.http.get('/v1/me').set(u.auth).expect(200)).body.profileComplete).toBe(true);
  });
});
