import { lastVibeHourEnded, vibeHourWindow } from './vibe-hour';

// Business time is UTC+5: 21:00 PKT = 16:00 UTC.
const at = (iso: string) => new Date(iso).getTime();
const OFF = 300;

describe('vibe hour window', () => {
  it('is active from start for its length, otherwise points at the next one', () => {
    expect(vibeHourWindow(at('2026-10-06T15:59:00Z'), OFF, 1260, 60)).toEqual({ active: false, startsAt: new Date('2026-10-06T16:00:00Z'), endsAt: new Date('2026-10-06T17:00:00Z'), day: expect.any(Number) });
    expect(vibeHourWindow(at('2026-10-06T16:00:00Z'), OFF, 1260, 60)).toMatchObject({ active: true, startsAt: new Date('2026-10-06T16:00:00Z') });
    expect(vibeHourWindow(at('2026-10-06T16:59:59Z'), OFF, 1260, 60).active).toBe(true);
    expect(vibeHourWindow(at('2026-10-06T17:00:00Z'), OFF, 1260, 60)).toMatchObject({ active: false, startsAt: new Date('2026-10-07T16:00:00Z') });
  });

  it('can run past business midnight', () => {
    // 23:30 PKT for 60 min = 18:30–19:30 UTC; at 00:10 PKT (19:10 UTC) the window that started "yesterday" is live.
    const w = vibeHourWindow(at('2026-10-06T19:10:00Z'), OFF, 23 * 60 + 30, 60);
    expect(w).toMatchObject({ active: true, startsAt: new Date('2026-10-06T18:30:00Z'), endsAt: new Date('2026-10-06T19:30:00Z') });
  });

  it('keys each window by its business day', () => {
    const a = vibeHourWindow(at('2026-10-06T16:10:00Z'), OFF, 1260, 60);
    const b = vibeHourWindow(at('2026-10-07T16:10:00Z'), OFF, 1260, 60);
    expect(b.day! - a.day!).toBe(1);
  });

  it('is off when the length is 0', () => {
    expect(vibeHourWindow(at('2026-10-06T16:10:00Z'), OFF, 1260, 0)).toEqual({ active: false, startsAt: null, endsAt: null, day: null });
    expect(lastVibeHourEnded(at('2026-10-06T16:10:00Z'), OFF, 1260, 0)).toBeNull();
  });

  it('finds the window that ended last', () => {
    expect(lastVibeHourEnded(at('2026-10-06T17:05:00Z'), OFF, 1260, 60)?.endsAt).toEqual(new Date('2026-10-06T17:00:00Z'));
    expect(lastVibeHourEnded(at('2026-10-06T16:30:00Z'), OFF, 1260, 60)?.endsAt).toEqual(new Date('2026-10-05T17:00:00Z'));
  });
});
