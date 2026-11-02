import { buildNotes, change, hourLabel, NotesInput } from './notes';

const base: NotesInput = {
  days: 7,
  goodCalls: { cur: 50, prev: 50 },
  active: { cur: 30, prev: 30 },
  signups: { cur: 10, prev: 10 },
  revenueUsd: { cur: 20, prev: 20 },
  matching: { searches: 0, gaveUpRate: 0, worstHour: null, busiestHour: null, calls: 0, quickSkipRate: 0, rematchSoon: 0 },
  sources: [],
};

describe('dashboard notes', () => {
  it('hour labels', () => {
    expect([0, 9, 12, 22, 23].map(hourLabel)).toEqual(['12am', '9am', '12pm', '10pm', '11pm']);
  });

  it('change needs something to compare', () => {
    expect(change({ cur: 2, prev: 1 })).toBeNull();
    expect(change({ cur: 10, prev: 0 })).toBeNull();
    expect(change({ cur: 15, prev: 10 })).toBeCloseTo(0.5);
  });

  it('says nothing when nothing moved', () => {
    expect(buildNotes(base)).toEqual([]);
  });

  it('empty rooms first, then big changes, then where people come from', () => {
    const notes = buildNotes(
      {
        ...base,
        goodCalls: { cur: 30, prev: 50 },
        matching: { searches: 40, gaveUpRate: 0.4, worstHour: { hour: 23, avgWaitSec: 48, searches: 6 }, busiestHour: { hour: 21, searches: 20 }, calls: 30, quickSkipRate: 0.2, rematchSoon: 0 },
        sources: [
          { source: 'invite', d1Rate: 0.45, eligible: 10 },
          { source: 'tiktok', d1Rate: 0.12, eligible: 25 },
        ],
      },
      10,
    );
    expect(notes.map((n) => n.tone)).toEqual(['bad', 'bad', 'bad', 'info', 'info']);
    expect(notes[0].text).toContain('40% of searches');
    expect(notes[1].text).toContain('around 11pm (48 s');
    expect(notes[2].text).toBe('Good calls down 40% compared with the week before.');
    expect(notes[3].text).toContain('People from invites stay best: 45%');
    expect(notes[4].text).toContain('around 9pm');
  });

  it('good news is green; at most four notes', () => {
    const notes = buildNotes({ ...base, signups: { cur: 30, prev: 10 }, revenueUsd: { cur: 60, prev: 20 }, goodCalls: { cur: 100, prev: 50 }, active: { cur: 60, prev: 30 }, matching: { ...base.matching, busiestHour: { hour: 20, searches: 9 } } });
    expect(notes).toHaveLength(4);
    expect(notes.every((n) => n.tone === 'good')).toBe(true);
    expect(buildNotes({ ...base, days: 1, signups: { cur: 20, prev: 10 } })[0].text).toContain('compared with yesterday');
  });
});
