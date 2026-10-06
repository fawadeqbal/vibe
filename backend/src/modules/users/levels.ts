/**
 * Levels from XP. Reaching level n takes `25 · n · (n − 1)` XP in total
 * (L1 = 0, L2 = 50, L3 = 150, L4 = 300 …): each level needs 50 XP more than
 * the one before, so early levels come fast and later ones mean something.
 */
export const xpForLevel = (level: number): number => 25 * level * (level - 1);

export function levelOf(xp: number): number {
  if (!(xp > 0)) return 1;
  // Inverse of 25n(n−1) ≤ xp, then nudged for floating point at exact thresholds.
  let n = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * xp) / 25)) / 2));
  while (xpForLevel(n + 1) <= xp) n++;
  while (n > 1 && xpForLevel(n) > xp) n--;
  return n;
}

export interface LevelProgress {
  level: number;
  /** Total XP. */
  xp: number;
  /** Total XP at which the current level started. */
  levelXp: number;
  /** Total XP needed for the next level ("120 XP to Level 8" = nextLevelXp − xp). */
  nextLevelXp: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelOf(xp);
  return { level, xp: Math.max(0, xp), levelXp: xpForLevel(level), nextLevelXp: xpForLevel(level + 1) };
}
