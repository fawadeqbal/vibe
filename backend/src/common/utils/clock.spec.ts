import { AppConfig } from '../../config/app-config.service';
import { Clock, dayIndexOf, weekIndexOfDay } from './clock';

describe('business clock', () => {
  const clock = new Clock({ get: () => 300 } as unknown as AppConfig);

  it('days roll over at midnight business time (UTC+5)', () => {
    expect(clock.dayIndex(new Date('2026-10-06T18:59:59Z'))).toBe(clock.dayIndex(new Date('2026-10-06T00:00:00Z')));
    expect(clock.dayIndex(new Date('2026-10-06T19:00:00Z'))).toBe(clock.dayIndex(new Date('2026-10-06T00:00:00Z')) + 1);
    expect(dayIndexOf(0, 0)).toBe(0);
    expect(clock.dayStart(clock.dayIndex(new Date('2026-10-06T12:00:00Z')))).toEqual(new Date('2026-10-05T19:00:00Z'));
    expect(clock.minuteOfDay(new Date('2026-10-06T16:00:00Z'))).toBe(21 * 60);
  });

  it('startOfDay is the instant of local midnight, never in the future (00:09 PKT regression)', () => {
    const justAfterMidnight = new Date('2026-10-06T19:09:00Z'); // 00:09 on 7 Oct in Pakistan
    expect(clock.startOfDay(justAfterMidnight)).toEqual(new Date('2026-10-06T19:00:00Z'));
    expect(clock.startOfDay(justAfterMidnight).getTime()).toBeLessThanOrEqual(justAfterMidnight.getTime());
    // dayOf is the calendar day for @db.Date columns: here it is ahead of "now".
    expect(clock.dayOf(justAfterMidnight)).toEqual(new Date('2026-10-07T00:00:00Z'));
    expect(clock.startOfDay(new Date('2026-10-06T12:00:00Z'))).toEqual(new Date('2026-10-05T19:00:00Z'));
  });

  it('weeks start on Monday 00:00 business time', () => {
    // 2026-10-05 is a Monday.
    const monday = new Date('2026-10-04T19:00:00Z');
    expect(clock.weekday(monday)).toBe(0);
    expect(clock.weekday(new Date('2026-10-04T18:59:59Z'))).toBe(6);
    expect(clock.weekStart(clock.weekIndex(new Date('2026-10-08T10:00:00Z')))).toEqual(monday);
    expect(clock.weekIndex(new Date('2026-10-04T18:59:59Z'))).toBe(clock.weekIndex(monday) - 1);
    expect(weekIndexOfDay(-3)).toBe(0); // 1969-12-29 was a Monday
  });
});
