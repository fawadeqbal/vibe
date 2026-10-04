import { compatible, pickPartner, queueScore } from './compatibility';
import { Ticket } from './matching.types';

const t = (id: string, o: Partial<Ticket> = {}, prefs: Partial<Ticket['prefs']> = {}): Ticket => ({
  userId: id,
  gender: 'FEMALE',
  countryCode: 'PK',
  verified: false,
  cost: 0,
  vip: false,
  boosted: false,
  enqueuedAt: 0,
  exclude: [],
  ...o,
  prefs: { gender: 'ANYONE', countryCode: null, safeMode: false, autoBlur: true, ...prefs },
});

describe('compatibility', () => {
  it('anyone meets anyone, but never themselves', () => {
    expect(compatible(t('a'), t('b'))).toBe(true);
    expect(compatible(t('a'), t('a'))).toBe(false);
  });

  it('both sides must accept each other', () => {
    const wantsMen = t('a', { gender: 'FEMALE' }, { gender: 'MEN' });
    expect(compatible(wantsMen, t('b', { gender: 'FEMALE' }))).toBe(false);
    expect(compatible(wantsMen, t('b', { gender: 'MALE' }))).toBe(true);
    expect(compatible(wantsMen, t('b', { gender: 'MALE' }, { gender: 'MEN' }))).toBe(false);
  });

  it('country and safe mode filter the other side', () => {
    expect(compatible(t('a', {}, { countryCode: 'TR' }), t('b', { countryCode: 'PK' }))).toBe(false);
    expect(compatible(t('a', {}, { countryCode: 'TR' }), t('b', { countryCode: 'TR' }))).toBe(true);
    expect(compatible(t('a', {}, { safeMode: true }), t('b', { verified: false }))).toBe(false);
    expect(compatible(t('a', {}, { safeMode: true }), t('b', { verified: true }))).toBe(true);
  });

  it('blocks and the last partner are excluded both ways', () => {
    expect(compatible(t('a', { exclude: ['b'] }), t('b'))).toBe(false);
    expect(compatible(t('a'), t('b', { exclude: ['a'] }))).toBe(false);
  });

  it('VIP and boost get a head start, not the front', () => {
    expect(queueScore({ enqueuedAt: 100_000, vip: true, boosted: false })).toBe(80_000);
    expect(queueScore({ enqueuedAt: 100_000, vip: true, boosted: true })).toBe(50_000);
  });

  it('picks the first compatible candidate in queue order', () => {
    const me = t('me', {}, { gender: 'MEN' });
    expect(pickPartner(me, [t('x', { gender: 'FEMALE' }), t('y', { gender: 'MALE' }), t('z', { gender: 'MALE' })])?.userId).toBe('y');
  });
});
