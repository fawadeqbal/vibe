import { createTestApp, resetState, signUp, TestApp } from './helpers';

/** One set of filters for random matches and Discover, saved on the account, and one filter pass. */
describe('shared filters', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t);
  });
  afterAll(() => t.close());

  it('starts open-minded, saves what you change, and keeps the rest', async () => {
    const u = await signUp(t);
    const first = (await t.http.get('/v1/filters').set(u.auth).expect(200)).body;
    expect(first.filters).toEqual({ gender: 'anyone', minAge: 18, maxAge: 99, countryCode: null, verifiedOnly: false });
    expect(first.access).toMatchObject({ unlocked: false, passCost: 25, passHours: 24 });

    await t.http.put('/v1/filters').set(u.auth).send({ gender: 'women', minAge: 20, maxAge: 30 }).expect(200);
    const saved = (await t.http.put('/v1/filters').set(u.auth).send({ countryCode: 'PK' }).expect(200)).body;
    expect(saved.filters).toEqual({ gender: 'women', minAge: 20, maxAge: 30, countryCode: 'PK', verifiedOnly: false });
    expect((await t.http.put('/v1/filters').set(u.auth).send({ countryCode: null }).expect(200)).body.filters.countryCode).toBeNull();
    await t.http.put('/v1/filters').set(u.auth).send({ minAge: 40, maxAge: 30 }).expect(400);
    await t.http.put('/v1/filters').set(u.auth).send({ countryCode: 'XX' }).expect(400);
  });

  it('one pass opens the extra filters in Discover too', async () => {
    const u = await signUp(t);
    await t.http.get('/v1/discover/deck').query({ gender: 'women' }).set(u.auth).expect(402);
    const after = (await t.http.post('/v1/filters/pass').set(u.auth).expect(200)).body;
    expect(after.access).toMatchObject({ unlocked: true, reason: 'pass' });
    expect((await t.http.get('/v1/wallet').set(u.auth)).body.coins).toBe(5);
    await t.http.get('/v1/discover/deck').query({ gender: 'women' }).set(u.auth).expect(200);
    expect((await t.http.get('/v1/discover/status').set(u.auth)).body.filters).toMatchObject({ unlocked: true, reason: 'pass' });
    // Already open: buying again costs nothing.
    await t.http.post('/v1/filters/pass').set(u.auth).expect(200);
    expect((await t.http.get('/v1/wallet').set(u.auth)).body.coins).toBe(5);
  });
});
