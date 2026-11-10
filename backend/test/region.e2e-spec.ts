import { io } from 'socket.io-client';

import { createTestApp, resetState, signUp, staffLogin, TestApp, TestStaff } from './helpers';

/** Blocked countries (admin → Settings → Region): refused at the API, on sockets, and in profiles and payments. */
describe('region blocking', () => {
  let t: TestApp;
  let owner: TestStaff;
  const fromIndia = { 'CF-IPCountry': 'IN' };
  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t);
    owner = await staffLogin(t);
  });
  afterAll(() => t.close());

  it('refuses sign-in from a blocked country with 451 REGION_UNAVAILABLE', async () => {
    const res = await t.http.post('/v1/auth/otp/request').set(fromIndia).send({ email: 'someone@vibe.test' }).expect(451);
    expect(res.body.error).toMatchObject({ code: 'REGION_UNAVAILABLE', details: { country: 'IN' } });
    await t.http.post('/v1/auth/otp/request').set({ 'CF-IPCountry': 'PK' }).send({ email: 'someone@vibe.test' }).expect(200);
    // Everything else stays open: health checks, legal pages, staff.
    await t.http.get('/health/live').set(fromIndia).expect(200);
    await t.http.get('/v1/legal').set(fromIndia).expect(200);
    await t.http.get('/v1/admin/settings').set(owner.auth).set(fromIndia).expect(200);
  });

  it('refuses signed-in people too, and their sockets', async () => {
    const u = await signUp(t);
    await t.http.get('/v1/me').set(u.auth).set({ 'CF-IPCountry': 'AF' }).expect(451);
    await t.http.get('/v1/me').set(u.auth).expect(200);
    const err = await new Promise<Error>((resolve, reject) => {
      const s = io(t.url, { auth: { token: u.token }, extraHeaders: { 'CF-IPCountry': 'IL' }, transports: ['websocket'], forceNew: true, reconnection: false });
      s.once('connect', () => (s.close(), reject(new Error('connected'))));
      s.once('connect_error', (e) => (s.close(), resolve(e)));
    });
    expect(err.message).toBe('REGION_UNAVAILABLE');
  });

  it('keeps blocked countries out of profiles and the catalog', async () => {
    const u = await signUp(t);
    const res = await t.http.patch('/v1/me').set(u.auth).send({ countryCode: 'IN' }).expect(400);
    expect(res.body.error).toMatchObject({ code: 'COUNTRY_NOT_SUPPORTED', message: expect.stringContaining('India') });
    expect((await t.http.get('/v1/catalog').expect(200)).body.blockedCountries).toEqual(['AF', 'IL', 'IN']);
  });

  it('refuses wallet numbers and IBANs from blocked countries', async () => {
    const u = await signUp(t);
    const phone = await t.http.post('/v1/wallet/payout-accounts').set(u.auth).send({ method: 'JAZZCASH', account: '+972501234567', holderName: 'Test Person' }).expect(400);
    expect(phone.body.error).toMatchObject({ code: 'COUNTRY_NOT_SUPPORTED', message: expect.stringContaining('Israel') });
    await t.http.post('/v1/wallet/payout-accounts').set(u.auth).send({ method: 'BANK', account: 'IL620108000000099999999', holderName: 'Test Person', bankName: 'Leumi' }).expect(400);
  });

  it('staff change the list in Admin and see the refusals', async () => {
    await t.http.put('/v1/admin/settings/region.blockedCountries').set(owner.auth).send({ value: ['IN', 'IL', 'AF', 'BD'] }).expect(200);
    await t.http.put('/v1/admin/settings/region.blockedCountries').set(owner.auth).send({ value: ['ZZ'] }).expect(400);
    await t.http.post('/v1/auth/otp/request').set({ 'CF-IPCountry': 'BD' }).send({ email: 'b@vibe.test' }).expect(451);
    const setting = ((await t.http.get('/v1/admin/settings').set(owner.auth).expect(200)).body as { key: string; type: string }[]).find((s) => s.key === 'region.blockedCountries');
    expect(setting?.type).toBe('countries');
    const stats = (await t.http.get('/v1/admin/region/refusals').set(owner.auth).expect(200)).body;
    expect(stats.total).toBeGreaterThanOrEqual(5);
    expect(stats.countries.map((c: { country: string }) => c.country)).toEqual(expect.arrayContaining(['IN', 'AF', 'IL', 'BD']));

    // Switched off: everyone gets in.
    await t.http.put('/v1/admin/settings/region.blockEnabled').set(owner.auth).send({ value: false }).expect(200);
    await t.http.post('/v1/auth/otp/request').set(fromIndia).send({ email: 'c@vibe.test' }).expect(200);
    expect((await t.http.get('/v1/catalog').expect(200)).body.blockedCountries).toEqual([]);
  });
});
