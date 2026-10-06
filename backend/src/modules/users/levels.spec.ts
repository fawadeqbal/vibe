import { badgesFor, earnedBadgeIds } from './badges';
import { levelOf, levelProgress, xpForLevel } from './levels';

describe('levels', () => {
  it('reaching level n takes 25·n·(n−1) XP', () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 50, 150, 300, 500]);
    expect(levelOf(0)).toBe(1);
    expect(levelOf(-5)).toBe(1);
    expect(levelOf(49)).toBe(1);
    expect(levelOf(50)).toBe(2);
    expect(levelOf(149)).toBe(2);
    expect(levelOf(150)).toBe(3);
    expect(levelOf(300)).toBe(4);
    for (let n = 1; n < 200; n++) {
      expect(levelOf(xpForLevel(n))).toBe(n);
      expect(levelOf(xpForLevel(n + 1) - 1)).toBe(n);
    }
  });

  it('progress shows where the current level started and what the next needs', () => {
    expect(levelProgress(120)).toEqual({ level: 2, xp: 120, levelXp: 50, nextLevelXp: 150 });
    expect(levelProgress(0)).toEqual({ level: 1, xp: 0, levelXp: 0, nextLevelXp: 50 });
  });
});

describe('badges', () => {
  const none = { verified: false, matches: 0, goodCalls: 0, likes: 0, giftsSent: 0, bestStreak: 0, nightCalls: 0, referrals: 0 };

  it('has stable ids in a fixed order', () => {
    expect(badgesFor(none).map((b) => b.id)).toEqual(['verified', 'first_vibes', 'social_butterfly', 'great_talker', 'loved', 'heartthrob', 'generous', 'streak_7', 'streak_30', 'night_owl', 'ambassador']);
    expect(earnedBadgeIds(none)).toEqual([]);
  });

  it('earns at the target and caps progress', () => {
    const b = badgesFor({ ...none, verified: true, matches: 12, likes: 49, bestStreak: 30, nightCalls: 25, giftsSent: 20, goodCalls: 3 });
    const by = Object.fromEntries(b.map((x) => [x.id, x]));
    expect(by.verified).toMatchObject({ earned: true, progress: 1, target: 1 });
    expect(by.first_vibes).toMatchObject({ earned: true, progress: 10, target: 10 });
    expect(by.social_butterfly).toMatchObject({ earned: false, progress: 12, target: 100 });
    expect(by.loved).toMatchObject({ earned: false, progress: 49 });
    expect(by.great_talker).toMatchObject({ earned: false, progress: 3, target: 50 });
    expect(by.generous.earned).toBe(true);
    expect(by.streak_7.earned && by.streak_30.earned && by.night_owl.earned).toBe(true);
    expect(by.night_owl.progress).toBe(20);
    expect(by.streak_7).toMatchObject({ name: 'On fire', emoji: '🔥' });
  });

  it('ambassador: 10 rewarded referrals', () => {
    const by = (n: number) => badgesFor({ ...none, referrals: n }).find((b) => b.id === 'ambassador')!;
    expect(by(9)).toMatchObject({ earned: false, progress: 9, target: 10, name: 'Ambassador', emoji: '🎖️' });
    expect(by(12)).toMatchObject({ earned: true, progress: 10 });
  });
});
