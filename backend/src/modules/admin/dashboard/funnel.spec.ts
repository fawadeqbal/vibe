import { buildFunnel, CohortCounts } from './funnel';

const row = (over: Partial<CohortCounts>): CohortCounts => ({
  day: '2026-10-20',
  signups: 0,
  setUp: 0,
  firstCall: 0,
  cameBack: 0,
  d1Ready: true,
  paid: 0,
  complete: 0,
  verified: 0,
  withinHour: 0,
  quickSkip: 0,
  ...over,
});

describe('buildFunnel', () => {
  const now = new Date('2026-10-26T10:00:00Z');

  it('rates every step against sign-ups and finds the biggest fall', () => {
    const f = buildFunnel([row({ signups: 100, setUp: 90, firstCall: 40, cameBack: 20, paid: 5 })], 12.4, 7, now);
    expect(f.steps.map((s) => [s.key, s.rate])).toEqual([
      ['signedUp', 1],
      ['setUp', 0.9],
      ['firstCall', 0.4],
      ['cameBack', 0.2],
      ['paid', 0.05],
    ]);
    expect(f.biggestDrop).toBe('firstCall');
    expect(f.extras.medianMinutesToFirstCall).toBe(12);
  });

  it('leaves days whose next day has not ended out of "came back"', () => {
    const f = buildFunnel([row({ signups: 10, cameBack: 5 }), row({ day: '2026-10-26', signups: 30, cameBack: 0, d1Ready: false })], null, 7, now);
    expect(f.steps.find((s) => s.key === 'cameBack')).toMatchObject({ count: 5, eligible: 10, rate: 0.5 });
    expect(f.cohorts[1].cameBack).toBeNull();
    expect(f.extras.medianMinutesToFirstCall).toBeNull();
  });

  it('has no biggest drop with no sign-ups', () => {
    const f = buildFunnel([row({})], null, 7, now);
    expect(f.biggestDrop).toBeNull();
    expect(f.steps.every((s) => s.rate === 0)).toBe(true);
  });
});
