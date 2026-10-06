import { inQuietHours, QUIET_CATEGORIES } from './quiet-hours';

describe('quiet hours', () => {
  const pkt = (hhmm: string) => new Date(`2026-10-06T${hhmm}:00+05:00`).getTime();

  it('wraps midnight in the user own offset', () => {
    const q = { quietHoursStart: 22 * 60, quietHoursEnd: 7 * 60, tzOffsetMinutes: 300 };
    expect(inQuietHours(pkt('23:00'), q)).toBe(true);
    expect(inQuietHours(pkt('06:59'), q)).toBe(true);
    expect(inQuietHours(pkt('07:00'), q)).toBe(false);
    expect(inQuietHours(pkt('21:59'), q)).toBe(false);
    // Same instant, a user in UTC: 23:00 PKT is 18:00 there.
    expect(inQuietHours(pkt('23:00'), { ...q, tzOffsetMinutes: 0 })).toBe(false);
  });

  it('daytime ranges, and off unless both ends are set', () => {
    expect(inQuietHours(pkt('13:00'), { quietHoursStart: 12 * 60, quietHoursEnd: 14 * 60, tzOffsetMinutes: 300 })).toBe(true);
    expect(inQuietHours(pkt('13:00'), { quietHoursStart: null, quietHoursEnd: 14 * 60, tzOffsetMinutes: 300 })).toBe(false);
    expect(inQuietHours(pkt('13:00'), { quietHoursStart: 600, quietHoursEnd: 600, tzOffsetMinutes: 300 })).toBe(false);
  });

  it('holds back social, engagement and inbox — never messages or payments', () => {
    expect([...QUIET_CATEGORIES].sort()).toEqual(['engagement', 'inbox', 'social']);
  });
});
