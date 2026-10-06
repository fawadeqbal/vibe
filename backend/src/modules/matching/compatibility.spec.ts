import { compatible, partnerScore, pickPartner, queueScore } from './compatibility';
import { callSignal, freeReconnectUntil, isFreeReconnect, isNightCall, nextVibeScore } from './match-rules';
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

  describe('pickPartner scoring', () => {
    const now = 1_000_000;
    const me = t('me', { interests: ['Music', 'Travel', 'Art', 'Books'], vibeScore: 0.8, enqueuedAt: now });

    it('scores shared interests (up to 3) and a similar vibe score', () => {
      expect(partnerScore(me, t('a', { interests: ['Music'], vibeScore: 0.8, enqueuedAt: now }), { oldest: false, nowMs: now })).toBeCloseTo(2 + 3);
      expect(partnerScore(me, t('a', { interests: ['Music', 'Travel', 'Art', 'Books'], vibeScore: 0.3, enqueuedAt: now }), { oldest: false, nowMs: now })).toBeCloseTo(6 + 1.5);
      // Old tickets without the new fields count as no interests and an average score.
      expect(partnerScore(me, t('a', { enqueuedAt: now }), { oldest: false, nowMs: now })).toBeCloseTo(3 * 0.7);
    });

    it('prefers the better match over the head of the queue', () => {
      const head = t('head', { interests: [], vibeScore: 0.1, enqueuedAt: now - 5000 });
      const good = t('good', { interests: ['Music', 'Travel'], vibeScore: 0.8, enqueuedAt: now - 1000 });
      expect(pickPartner(me, [head, good], now)?.userId).toBe('good');
    });

    it('the oldest candidate gets +4 after waiting over 20 s', () => {
      const starving = t('old', { interests: [], vibeScore: 0.5, enqueuedAt: now - 21_000 });
      const good = t('good', { interests: ['Music'], vibeScore: 0.8, enqueuedAt: now - 1000 });
      expect(pickPartner(me, [starving, good], now)?.userId).toBe('old');
      expect(pickPartner(me, [{ ...starving, enqueuedAt: now - 19_000 }, good], now)?.userId).toBe('good');
    });

    it('only looks at the first 8 compatible candidates, and ties keep queue order', () => {
      const plain = Array.from({ length: 8 }, (_, i) => t(`p${i}`, { enqueuedAt: now - 100 + i }));
      const perfect = t('perfect', { interests: ['Music', 'Travel', 'Art'], vibeScore: 0.8, enqueuedAt: now });
      expect(pickPartner(me, [...plain, perfect], now)?.userId).toBe('p0');
      expect(pickPartner(me, [t('x', { enqueuedAt: now }), t('y', { enqueuedAt: now })], now)?.userId).toBe('x');
      expect(pickPartner(t('me', {}, { gender: 'MEN' }), [t('w')], now)).toBeUndefined();
    });
  });

  describe('reconnect and call rules', () => {
    const endedAt = new Date('2026-10-06T12:00:00Z');

    it('reconnect is free for a while after a dropped call or a mutual like', () => {
      expect(freeReconnectUntil({ endedAt, endReason: 'DISCONNECTED', mutualLike: false }, 10)).toEqual(new Date('2026-10-06T12:10:00Z'));
      expect(freeReconnectUntil({ endedAt, endReason: 'SKIPPED', mutualLike: true }, 10)).toEqual(new Date('2026-10-06T12:10:00Z'));
      expect(freeReconnectUntil({ endedAt, endReason: 'SKIPPED', mutualLike: false }, 10)).toBeNull();
      expect(freeReconnectUntil({ endedAt, endReason: 'DISCONNECTED', mutualLike: true }, 0)).toBeNull();
      expect(freeReconnectUntil({ endedAt: null, endReason: null, mutualLike: true }, 10)).toBeNull();
      const until = freeReconnectUntil({ endedAt, endReason: 'DISCONNECTED', mutualLike: false }, 10);
      expect(isFreeReconnect(until, new Date('2026-10-06T12:09:59Z'))).toBe(true);
      expect(isFreeReconnect(until, new Date('2026-10-06T12:10:00Z'))).toBe(false);
      expect(isFreeReconnect(null, endedAt)).toBe(false);
    });

    it('call signals feed the vibe score', () => {
      const c = { durationSeconds: 5, likedByPartner: false, reportedByPartner: false, skippedByPartner: false };
      expect(callSignal({ ...c, durationSeconds: 90, reportedByPartner: true })).toBe(0);
      expect(callSignal({ ...c, durationSeconds: 60 })).toBe(1);
      expect(callSignal({ ...c, likedByPartner: true })).toBe(1);
      expect(callSignal({ ...c, durationSeconds: 30 })).toBe(0.6);
      expect(callSignal({ ...c, skippedByPartner: true })).toBe(0.3);
      expect(callSignal(c)).toBeNull();
      expect(nextVibeScore(0.5, 1)).toBeCloseTo(0.55);
      expect(nextVibeScore(0.5, 0)).toBeCloseTo(0.45);
      expect(isNightCall(0)).toBe(true);
      expect(isNightCall(239)).toBe(true);
      expect(isNightCall(240)).toBe(false);
    });
  });
});
