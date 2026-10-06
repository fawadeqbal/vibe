import { describe, expect, it } from "vitest";

import { applyGameAnswer, callGame, friend, leaderboard, mePrefs, momentFeed, profileView, progress, streak, vibeHour, wallet } from "../api/mappers";
import {
  boardScore,
  BreakTimer,
  clock12,
  countdown,
  freeReconnectLeft,
  hhmmToMinutes,
  leaderboardMe,
  levelFraction,
  minutesToHHMM,
  parseGemGoal,
  recapHasNews,
  recapVisible,
  streakStatus,
  streakTone,
  vibeHourLive,
  vibeHourPhase,
  xpToNext,
} from "../engagement";
import { NO_STREAK } from "../models";

describe("friend streaks", () => {
  it("picks the flame tone", () => {
    expect(streakTone(NO_STREAK)).toBe("none");
    expect(streakTone({ ...NO_STREAK, count: 4 })).toBe("pending");
    expect(streakTone({ ...NO_STREAK, count: 4, today: true })).toBe("today");
    expect(streakTone({ ...NO_STREAK, count: 12, atRisk: true })).toBe("atRisk");
    // A restorable streak has count 0: no chip, the restore button shows instead.
    expect(streakTone({ ...NO_STREAK, restorable: true, lostCount: 9 })).toBe("none");
  });

  it("explains what is missing today", () => {
    expect(streakStatus({ ...NO_STREAK, count: 3, mineToday: true }, "Ali")).toBe("Waiting for Ali to message you today.");
    expect(streakStatus({ ...NO_STREAK, count: 3, theirsToday: true }, "Ali")).toContain("reply");
    expect(streakStatus({ ...NO_STREAK, count: 3, today: true }, "Ali")).toContain("Today counts");
    expect(streakStatus({ ...NO_STREAK, restorable: true, lostCount: 12 }, "Ali")).toBe("Your 12-day streak ended yesterday.");
  });

  it("maps the friend streak", () => {
    const f = friend({ profile: { id: "f", level: 3 }, state: "friends", streak: { count: 12, best: 30, today: false, atRisk: true, restoreCost: 30 } });
    expect(f.streak).toMatchObject({ count: 12, best: 30, atRisk: true, restorable: false, restoreCost: 30 });
    expect(f.profile.level).toBe(3);
    expect(friend({ profile: { id: "g" }, state: "incoming" }).streak).toEqual(NO_STREAK);
    expect(streak({ count: "x" }).count).toBe(0);
  });
});

describe("levels", () => {
  it("measures progress through the level", () => {
    const p = { level: 3, xp: 225, levelXp: 150, nextLevelXp: 300 };
    expect(levelFraction(p)).toBe(0.5);
    expect(xpToNext(p)).toBe(75);
    expect(levelFraction({ level: 1, xp: 0, levelXp: 0, nextLevelXp: 50 })).toBe(0);
    expect(levelFraction({ level: 1, xp: 0, levelXp: 0, nextLevelXp: 0 })).toBe(0);
  });

  it("maps progress and the profile view's level and badges", () => {
    const p = progress({ level: 2, xp: 60, levelXp: 50, nextLevelXp: 150, weekXp: 20, badges: [{ id: "loved", name: "Loved", emoji: "💖", earned: false, progress: 12, target: 50 }] });
    expect(p.badges[0]).toMatchObject({ id: "loved", earned: false, progress: 12, target: 50 });
    const v = profileView({ profile: { id: "u", level: 7 }, tier: "matched", level: 7, badges: ["verified", 3], rel: {} });
    expect(v.level).toBe(7);
    expect(v.badges).toEqual(["verified"]);
  });
});

describe("Vibe Hour", () => {
  const start = new Date("2026-10-06T16:00:00Z");
  const end = new Date("2026-10-06T17:00:00Z");
  const v = vibeHour({ active: false, startsAt: start.toISOString(), endsAt: end.toISOString() });

  it("knows live, soon and off", () => {
    expect(vibeHourPhase(v, start.getTime() - 3 * 3600_000)).toEqual({ phase: "off" });
    expect(vibeHourPhase(v, start.getTime() - 3600_000)).toEqual({ phase: "soon", startsAt: start });
    expect(vibeHourPhase(v, start.getTime() + 17 * 60_000 + 50_000)).toEqual({ phase: "live", secondsLeft: 2530, endsAt: end });
    expect(vibeHourLive(v, end.getTime())).toBe(false);
    expect(vibeHourPhase(vibeHour({ active: false, startsAt: null, endsAt: null }))).toEqual({ phase: "off" });
    expect(vibeHourPhase(null)).toEqual({ phase: "off" });
  });

  it("formats the countdown and the start time", () => {
    expect(countdown(2530)).toBe("42:10");
    expect(countdown(3725)).toBe("1:02:05");
    expect(countdown(-4)).toBe("0:00");
    expect(clock12(new Date(2026, 9, 6, 21, 0))).toBe("9:00 PM");
    expect(clock12(new Date(2026, 9, 6, 0, 5))).toBe("12:05 AM");
    expect(clock12(new Date(2026, 9, 6, 12, 30))).toBe("12:30 PM");
  });

  it("counts the free reconnect window down", () => {
    const now = Date.now();
    expect(freeReconnectLeft(null, now)).toBe(0);
    expect(freeReconnectLeft(new Date(now + 581_000), now)).toBe(581);
    expect(freeReconnectLeft(new Date(now - 1), now)).toBe(0);
  });
});

describe("leaderboards", () => {
  const b = leaderboard({
    board: "xp",
    weekStart: "2026-10-04T19:00:00Z",
    weekEnd: "2026-10-11T19:00:00Z",
    top: [
      { rank: 1, profile: { id: "a", name: "A" }, score: 900 },
      { rank: 2, profile: { id: "me", name: "Me" }, score: 340 },
    ],
    me: { rank: 2, score: 340 },
  });

  it("finds your row in the list or from `me`", () => {
    expect(leaderboardMe(b, "me")).toEqual({ rank: 2, score: 340, inTop: true });
    expect(leaderboardMe({ ...b, me: { rank: 128, score: 12 } }, "zz")).toEqual({ rank: 128, score: 12, inTop: false });
    expect(leaderboardMe({ ...b, me: { rank: null, score: 0 } }, null)).toEqual({ rank: null, score: 0, inTop: false });
  });

  it("writes the score", () => {
    expect(boardScore("xp", 1340)).toBe("1,340 XP");
    expect(boardScore("gems", 1)).toBe("1 gem");
  });
});

describe("settings", () => {
  it("converts quiet hours both ways", () => {
    expect(minutesToHHMM(1320)).toBe("22:00");
    expect(minutesToHHMM(7)).toBe("00:07");
    expect(minutesToHHMM(1440)).toBe("00:00");
    expect(hhmmToMinutes("07:30")).toBe(450);
    expect(hhmmToMinutes("7:05")).toBe(425);
    expect(hhmmToMinutes("24:00")).toBeNull();
    expect(hhmmToMinutes("")).toBeNull();
    for (const m of [0, 59, 60, 719, 1439]) expect(hhmmToMinutes(minutesToHHMM(m))).toBe(m);
  });

  it("reads the new GET /me fields and the wallet's", () => {
    expect(mePrefs({ xp: 60, gemGoal: 5000, quietHoursStart: 1320, quietHoursEnd: 420, tzOffsetMinutes: -240, breakReminderMinutes: 60 })).toEqual({
      xp: 60,
      gemGoal: 5000,
      quietHoursStart: 1320,
      quietHoursEnd: 420,
      tzOffsetMinutes: -240,
      breakReminderMinutes: 60,
    });
    expect(mePrefs({})).toMatchObject({ gemGoal: null, quietHoursStart: null, tzOffsetMinutes: 300, breakReminderMinutes: null });
    expect(wallet({ coins: 1, gemGoal: 2000, freeBoosts: 1 })).toMatchObject({ gemGoal: 2000, freeBoosts: 1 });
    expect(wallet({})).toMatchObject({ gemGoal: null, freeBoosts: 0 });
  });

  it("reminds once after the limit and starts over after a 10 minute break", () => {
    const t = new BreakTimer();
    let now = 0;
    const step = (min: number, counting: boolean, limit: number | null = 30) => {
      let fired = false;
      for (let i = 0; i < min; i++) {
        now += 60_000;
        fired = t.tick(now, counting, limit) || fired;
      }
      return fired;
    };
    t.tick(now, false, 30);
    expect(step(29, true)).toBe(false);
    expect(step(1, true)).toBe(true);
    expect(step(5, true)).toBe(false); // only once
    t.reset();
    expect(step(20, true)).toBe(false);
    expect(step(9, false)).toBe(false); // a short pause keeps the count
    expect(step(10, true)).toBe(true);
    t.reset();
    expect(step(25, true)).toBe(false);
    step(10, false); // a real break
    expect(step(29, true)).toBe(false);
    expect(step(30, true, null)).toBe(false); // off
  });
});

describe("moments and games", () => {
  it("maps the moments feed", () => {
    const f = momentFeed({
      mine: [{ id: "m1", mediaUrl: "u", caption: "hi", createdAt: "2026-10-06T10:00:00Z", expiresAt: "2026-10-07T10:00:00Z", seen: true, viewsCount: 3 }],
      people: [
        { author: { id: "a", name: "Ali" }, moments: [{ id: "m2", mediaUrl: "v", seen: false }], allSeen: false },
        { author: { id: "b" }, moments: [], allSeen: true },
      ],
    });
    expect(f.mine[0]).toMatchObject({ id: "m1", viewsCount: 3, caption: "hi" });
    expect(f.people).toHaveLength(1);
    expect(f.people[0].moments[0]).toMatchObject({ id: "m2", seen: false, viewsCount: null });
  });

  it("plays a round: prompt, answers, reveal", () => {
    const g = callGame({ matchId: "x", game: "wyr", round: 2, prompt: { text: "Would you rather…", options: ["Fly", "Swim"] }, by: "partner" })!;
    expect(g).toMatchObject({ game: "wyr", round: 2, options: ["Fly", "Swim"], by: "partner", mine: null, revealed: false });
    const waiting = applyGameAnswer(g, { round: 2, mine: null, theirs: null, revealed: false, partnerAnswered: true });
    expect(waiting).toMatchObject({ mine: null, partnerAnswered: true, theirs: null });
    const done = applyGameAnswer(waiting, { round: 2, mine: 1, theirs: 1, revealed: true, partnerAnswered: true });
    expect(done).toMatchObject({ mine: 1, theirs: 1, revealed: true });
    expect(applyGameAnswer(done, { round: 1, mine: 0 })).toBe(done);
    expect(callGame({ game: "chess", round: 1 })).toBeNull();
  });

  it("reveals an open question once both answered", () => {
    const q = { ...callGame({ game: "questions", round: 1, prompt: { text: "Best trip?" }, by: "me" })!, mine: -1 };
    expect(q.options).toBeNull();
    expect(applyGameAnswer(q, { round: 1, mine: null, theirs: null, revealed: false, partnerAnswered: false }).mine).toBe(-1);
    expect(applyGameAnswer(q, { round: 1, mine: null, theirs: null, revealed: true, partnerAnswered: true })).toMatchObject({ mine: -1, theirs: -1, revealed: true });
  });
});

describe("wallet goal and recap", () => {
  it("checks the typed goal", () => {
    expect(parseGemGoal("5,000")).toEqual({ goal: 5000 });
    expect(parseGemGoal("50")).toHaveProperty("error");
    expect(parseGemGoal("abc")).toHaveProperty("error");
    expect(parseGemGoal("20000000")).toHaveProperty("error");
  });

  it("shows the recap Monday to Wednesday, business time", () => {
    // Sunday 20:00 UTC = Monday 01:00 in Pakistan.
    expect(recapVisible(Date.UTC(2026, 9, 4, 20, 0))).toBe(true);
    expect(recapVisible(Date.UTC(2026, 9, 4, 18, 0))).toBe(false);
    expect(recapVisible(Date.UTC(2026, 9, 7, 12, 0))).toBe(true); // Wednesday
    expect(recapVisible(Date.UTC(2026, 9, 8, 12, 0))).toBe(false); // Thursday
    expect(recapHasNews({ gemsEarned: 0, giftsReceived: 0, likesReceived: 0, newFollowers: 0, matches: 0, bestStreak: 0 })).toBe(false);
    expect(recapHasNews({ gemsEarned: 0, giftsReceived: 0, likesReceived: 2, newFollowers: 0, matches: 0, bestStreak: 0 })).toBe(true);
  });
});
