/**
 * Streaks, levels, Vibe Hour, leaderboards and wellbeing settings: the pure
 * rules the screens read (same as the Flutter app's engagement helpers).
 * Unit-tested in lib/__tests__/engagement.test.ts.
 */
import type { GameId, Leaderboard, LevelProgress, StreakView, VibeHour } from "./models";

// ── friend streaks ────────────────────────────────────────────────────────

/** How the flame looks: none (hidden), waiting for today, counted today, ends tonight. */
export type StreakTone = "none" | "pending" | "today" | "atRisk";

export function streakTone(s: StreakView): StreakTone {
  if (s.count <= 0) return "none";
  if (s.today) return "today";
  if (s.atRisk) return "atRisk";
  return "pending";
}

/** "12-day streak", "1-day streak". */
export const streakDays = (n: number) => `${n}-day streak`;

/** The line under the explainer's title: what is still missing today. */
export function streakStatus(s: StreakView, name: string): string {
  if (s.restorable) return `Your ${s.lostCount}-day streak ended yesterday.`;
  if (s.count <= 0) return `Message ${name} today and tomorrow to start one.`;
  if (s.today) return "Today counts. See you tomorrow!";
  if (s.mineToday) return `Waiting for ${name} to message you today.`;
  if (s.theirsToday) return `${name} wrote today — reply to keep it going.`;
  return s.atRisk ? "Ends at midnight unless you both talk today." : "Talk today to keep it going.";
}

// ── levels ────────────────────────────────────────────────────────────────

/** Progress through the current level, 0…1. */
export function levelFraction(p: LevelProgress): number {
  const span = p.nextLevelXp - p.levelXp;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (p.xp - p.levelXp) / span));
}

export const xpToNext = (p: LevelProgress) => Math.max(0, p.nextLevelXp - p.xp);

/** Badge names and emojis by id (profile views only send the ids). Mirrors backend users/badges.ts. */
export const BADGES: Record<string, { name: string; emoji: string }> = {
  verified: { name: "Verified", emoji: "✔️" },
  first_vibes: { name: "First vibes", emoji: "👋" },
  social_butterfly: { name: "Social butterfly", emoji: "🦋" },
  great_talker: { name: "Great talker", emoji: "🎙️" },
  loved: { name: "Loved", emoji: "💖" },
  heartthrob: { name: "Heartthrob", emoji: "💘" },
  generous: { name: "Generous", emoji: "🎁" },
  streak_7: { name: "On fire", emoji: "🔥" },
  streak_30: { name: "Unstoppable", emoji: "☄️" },
  night_owl: { name: "Night owl", emoji: "🦉" },
};

// ── Vibe Hour ─────────────────────────────────────────────────────────────

/** Shown from this long before it starts. */
export const VIBE_HOUR_SOON_MS = 2 * 3600_000;

export type VibeHourPhase = { phase: "live"; secondsLeft: number; endsAt: Date } | { phase: "soon"; startsAt: Date } | { phase: "off" };

/** Where we are relative to the window the server gave us (it may have passed since). */
export function vibeHourPhase(v: VibeHour | null, now = Date.now()): VibeHourPhase {
  if (!v?.startsAt || !v.endsAt) return { phase: "off" };
  const start = v.startsAt.getTime();
  const end = v.endsAt.getTime();
  if (now >= start && now < end) return { phase: "live", secondsLeft: Math.ceil((end - now) / 1000), endsAt: v.endsAt };
  if (now < start && start - now <= VIBE_HOUR_SOON_MS) return { phase: "soon", startsAt: v.startsAt };
  return { phase: "off" };
}

export const vibeHourLive = (v: VibeHour | null, now = Date.now()) => vibeHourPhase(v, now).phase === "live";

/** Countdown: 2530 → "42:10"; 3725 → "1:02:05". */
export function countdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** 21:00 local → "9:00 PM". */
export function clock12(t: Date): string {
  const h = t.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(t.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// ── free reconnect ────────────────────────────────────────────────────────

/** Seconds of the free reconnect window left (0 = pay). */
export function freeReconnectLeft(until: Date | null, now = Date.now()): number {
  if (!until) return 0;
  return Math.max(0, Math.ceil((until.getTime() - now) / 1000));
}

// ── leaderboards ──────────────────────────────────────────────────────────

/** The sticky "You" row: your rank and score, and whether you are already in the list. */
export function leaderboardMe(b: Leaderboard, myId: string | null | undefined): { rank: number | null; score: number; inTop: boolean } {
  const row = myId ? b.top.find((r) => r.profile.id === myId) : undefined;
  if (row) return { rank: row.rank, score: row.score, inTop: true };
  return { rank: b.me.rank, score: b.me.score, inTop: false };
}

/** "340 XP" / "1,250 gems". */
export function boardScore(board: Leaderboard["board"], score: number): string {
  const n = Math.round(score).toLocaleString("en-US");
  return board === "xp" ? `${n} XP` : `${n} ${score === 1 ? "gem" : "gems"}`;
}

// ── settings ──────────────────────────────────────────────────────────────

/** 1320 → "22:00" (for `<input type="time">`). */
export function minutesToHHMM(m: number): string {
  const v = ((Math.trunc(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}

/** "07:30" → 450; null when it isn't a time. */
export function hhmmToMinutes(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** What the server stores as `tzOffsetMinutes` (UTC+5 = 300). */
export const tzOffsetMinutes = (d = new Date()) => -d.getTimezoneOffset();

export const BREAK_CHOICES = [null, 30, 60, 90, 120] as const;
export const DEFAULT_QUIET_HOURS = { start: 22 * 60, end: 7 * 60 };

/**
 * The break reminder (client only): counts time while you are searching or
 * in a call with the page visible. After `limitMin` it is due once; ten
 * minutes without counting (a hidden tab, the lobby) starts it over.
 */
export class BreakTimer {
  private counted = 0;
  private idle = 0;
  private last: number | null = null;
  private fired = false;
  static readonly RESET_MS = 10 * 60_000;

  /** Advance to `now`; `counting` is the state since the previous tick. True once when the reminder is due. */
  tick(now: number, counting: boolean, limitMin: number | null): boolean {
    const dt = this.last == null ? 0 : Math.max(0, Math.min(now - this.last, 5 * 60_000));
    this.last = now;
    if (counting) {
      this.counted += dt;
      this.idle = 0;
    } else {
      this.idle += dt;
      if (this.idle >= BreakTimer.RESET_MS) this.reset();
    }
    if (!limitMin || this.fired || this.counted < limitMin * 60_000) return false;
    this.fired = true;
    return true;
  }

  /** "Keep going" or a break: start counting from zero. */
  reset() {
    this.counted = 0;
    this.idle = 0;
    this.fired = false;
  }

  get countedMs() {
    return this.counted;
  }
}

// ── icebreakers ───────────────────────────────────────────────────────────

export const GAMES: { id: GameId; title: string; blurb: string; icon: string }[] = [
  { id: "wyr", title: "Would you rather", blurb: "Two choices, pick one each.", icon: "alt_route" },
  { id: "this_or_that", title: "This or that", blurb: "Quick picks — see if you match.", icon: "compare_arrows" },
  { id: "questions", title: "Deep & fun questions", blurb: "One question, you both answer out loud.", icon: "forum" },
];

export const gameTitle = (id: GameId) => GAMES.find((g) => g.id === id)?.title ?? "Game";

// ── wallet ────────────────────────────────────────────────────────────────

/** Business days are Pakistan time (UTC+5), like the server's. */
const BUSINESS_OFFSET_MS = 5 * 3600_000;

/** The weekly recap card shows Monday to Wednesday (business time). */
export function recapVisible(now = Date.now()): boolean {
  const day = new Date(now + BUSINESS_OFFSET_MS).getUTCDay();
  return day >= 1 && day <= 3;
}

/** A recap with anything to say. */
export const recapHasNews = (r: { gemsEarned: number; giftsReceived: number; likesReceived: number; newFollowers: number; matches: number; bestStreak: number }) =>
  r.gemsEarned + r.giftsReceived + r.likesReceived + r.newFollowers + r.matches + r.bestStreak > 0;

export const GEM_GOAL_MIN = 100;
export const GEM_GOAL_MAX = 10_000_000;

/** Typed goal → a valid number, or an error to show. */
export function parseGemGoal(text: string): { goal: number } | { error: string } {
  const n = Number(text.replace(/[,\s]/g, ""));
  if (!Number.isInteger(n) || n <= 0) return { error: "Enter a whole number of gems." };
  if (n < GEM_GOAL_MIN) return { error: `At least ${GEM_GOAL_MIN} gems.` };
  if (n > GEM_GOAL_MAX) return { error: "That's more than 10 million gems." };
  return { goal: n };
}
