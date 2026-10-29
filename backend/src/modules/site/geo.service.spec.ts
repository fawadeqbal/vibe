import { clientIp, GeoService } from './geo.service';

describe('IP location', () => {
  it('takes the real client address from the proxy headers, skipping private ones', () => {
    expect(clientIp({ 'cf-connecting-ip': '111.119.180.1', 'x-forwarded-for': '1.2.3.4' })).toBe('111.119.180.1');
    expect(clientIp({ 'x-forwarded-for': '39.32.0.1, 172.18.0.5' })).toBe('39.32.0.1');
    expect(clientIp({ 'x-forwarded-for': '10.0.0.4' }, '::ffff:5.31.0.1')).toBe('5.31.0.1');
    expect(clientIp({}, '127.0.0.1')).toBeNull();
  });

  it('finds country, region and city from the bundled database', async () => {
    const geo = new GeoService();
    expect(await geo.lookup('111.119.180.1')).toEqual({ country: 'PK', region: 'Punjab', city: 'Lahore' });
    expect((await geo.lookup('5.31.0.1')).country).toBe('AE');
    expect(await geo.lookup(null)).toEqual({ country: null, region: null, city: null });
  });
});
