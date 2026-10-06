/**
 * Badges are computed from counters on the user, never stored, so changing
 * a target re-grades everyone at once. Ids are stable: clients key icons
 * and copy on them.
 */
export interface BadgeStats {
  verified: boolean;
  matches: number;
  goodCalls: number;
  likes: number;
  giftsSent: number;
  bestStreak: number;
  nightCalls: number;
}

export interface BadgeDef {
  id: string;
  name: string;
  emoji: string;
  target: number;
  value: (s: BadgeStats) => number;
}

export const BADGES: readonly BadgeDef[] = [
  { id: 'verified', name: 'Verified', emoji: '✔️', target: 1, value: (s) => (s.verified ? 1 : 0) },
  { id: 'first_vibes', name: 'First vibes', emoji: '👋', target: 10, value: (s) => s.matches },
  { id: 'social_butterfly', name: 'Social butterfly', emoji: '🦋', target: 100, value: (s) => s.matches },
  { id: 'great_talker', name: 'Great talker', emoji: '🎙️', target: 50, value: (s) => s.goodCalls },
  { id: 'loved', name: 'Loved', emoji: '💖', target: 50, value: (s) => s.likes },
  { id: 'heartthrob', name: 'Heartthrob', emoji: '💘', target: 500, value: (s) => s.likes },
  { id: 'generous', name: 'Generous', emoji: '🎁', target: 20, value: (s) => s.giftsSent },
  { id: 'streak_7', name: 'On fire', emoji: '🔥', target: 7, value: (s) => s.bestStreak },
  { id: 'streak_30', name: 'Unstoppable', emoji: '☄️', target: 30, value: (s) => s.bestStreak },
  { id: 'night_owl', name: 'Night owl', emoji: '🦉', target: 20, value: (s) => s.nightCalls },
];

export interface BadgeView {
  id: string;
  name: string;
  emoji: string;
  earned: boolean;
  /** Capped at target. */
  progress: number;
  target: number;
}

export function badgesFor(s: BadgeStats): BadgeView[] {
  return BADGES.map((b) => {
    const v = Math.max(0, b.value(s));
    return { id: b.id, name: b.name, emoji: b.emoji, earned: v >= b.target, progress: Math.min(v, b.target), target: b.target };
  });
}

export const earnedBadgeIds = (s: BadgeStats): string[] => badgesFor(s).filter((b) => b.earned).map((b) => b.id);

/** The counters badges read, straight off a User row. */
export const badgeStatsOf = (u: { verified: boolean; matchesCount: number; goodCallsCount: number; likesCount: number; giftsSentCount: number; bestStreak: number; nightCallsCount: number }): BadgeStats => ({
  verified: u.verified,
  matches: u.matchesCount,
  goodCalls: u.goodCallsCount,
  likes: u.likesCount,
  giftsSent: u.giftsSentCount,
  bestStreak: u.bestStreak,
  nightCalls: u.nightCallsCount,
});
