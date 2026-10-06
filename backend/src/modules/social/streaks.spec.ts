import { applyActivity, EMPTY_STREAK, isWeeklyMilestone, StreakRow, streakView } from './streaks';

const T = 20_000;

describe('friend streaks', () => {
  it('a day counts only once both sides were active that day', () => {
    let r = applyActivity(EMPTY_STREAK, ['low'], T);
    expect(r.counted).toBe(false);
    r = applyActivity(r.row, ['low'], T);
    expect(r.counted).toBe(false);
    r = applyActivity(r.row, ['high'], T);
    expect(r).toMatchObject({ counted: true, row: { streakCount: 1, streakBest: 1, streakDay: T } });
    // More activity the same day changes nothing.
    expect(applyActivity(r.row, ['low', 'high'], T).counted).toBe(false);
  });

  it('consecutive days grow the streak; a gap starts over; best is kept', () => {
    let row: StreakRow = EMPTY_STREAK;
    for (let d = 0; d < 5; d++) row = applyActivity(row, ['low', 'high'], T + d).row;
    expect(row).toMatchObject({ streakCount: 5, streakBest: 5, streakDay: T + 4 });
    row = applyActivity(row, ['low', 'high'], T + 6).row;
    expect(row).toMatchObject({ streakCount: 1, streakBest: 5, streakDay: T + 6 });
  });

  it('activity on different days does not count', () => {
    const a = applyActivity(EMPTY_STREAK, ['low'], T).row;
    expect(applyActivity(a, ['high'], T + 1).counted).toBe(false);
  });

  it('pays on every 7th day', () => {
    expect([1, 6, 7, 8, 14, 0].map(isWeeklyMilestone)).toEqual([false, false, true, false, true, false]);
  });

  it('derives the view lazily from today', () => {
    const row: StreakRow = { streakCount: 12, streakBest: 30, streakDay: T, streakLowDay: T, streakHighDay: T - 1 };
    expect(streakView(row, T, 'low', 30)).toEqual({ count: 12, best: 30, today: true, atRisk: false, mineToday: true, theirsToday: false, restorable: false, lostCount: 0, restoreCost: 30 });
    expect(streakView(row, T, 'high', 30)).toMatchObject({ mineToday: false, theirsToday: true });
    // Tomorrow: still alive but at risk.
    expect(streakView(row, T + 1, 'low', 30)).toMatchObject({ count: 12, today: false, atRisk: true, mineToday: false, restorable: false });
    // The day after: broken, restorable.
    expect(streakView(row, T + 2, 'low', 0)).toMatchObject({ count: 0, atRisk: false, restorable: true, lostCount: 12, restoreCost: 0 });
    // Later: gone for good.
    expect(streakView(row, T + 3, 'low', 30)).toMatchObject({ count: 0, restorable: false, lostCount: 0 });
  });

  it('short streaks neither warn nor restore', () => {
    const row: StreakRow = { streakCount: 2, streakBest: 2, streakDay: T, streakLowDay: T, streakHighDay: T };
    expect(streakView(row, T + 1, 'low', 30)).toMatchObject({ count: 2, atRisk: false });
    expect(streakView(row, T + 2, 'low', 30)).toMatchObject({ count: 0, restorable: false });
    expect(streakView(EMPTY_STREAK, T, 'low', 30)).toMatchObject({ count: 0, best: 0, today: false });
  });

  it('a restored streak (streakDay = yesterday) continues when both talk today', () => {
    const restored: StreakRow = { streakCount: 12, streakBest: 12, streakDay: T - 1, streakLowDay: T - 2, streakHighDay: T - 3 };
    expect(applyActivity(restored, ['low', 'high'], T).row).toMatchObject({ streakCount: 13, streakDay: T });
  });
});
