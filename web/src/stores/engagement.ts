import { create } from "zustand";

import { asMap, leaderboard as mapLeaderboard, levelProgress, progress as mapProgress, vibeHour as mapVibeHour, weeklyRecap } from "@/lib/api/mappers";
import { Ev } from "@/lib/api/realtime";
import { vibeHourLive } from "@/lib/engagement";
import type { Board, Leaderboard, LevelProgress, Progress, VibeHour, WeeklyRecap } from "@/lib/models";

import { api, realtime } from "./services";

/**
 * Vibe Hour, your level and badges, weekly leaderboards and last week's
 * recap. `GET /engagement` once on sign-in and when the tab comes back;
 * the rest when a screen opens. Mirror of the Flutter `EngagementProvider`.
 */
interface EngagementState {
  vibeHour: VibeHour | null;
  level: LevelProgress | null;
  streaksAtRisk: number;
  /** GET /me/progress (badges, this week's XP). */
  progress: Progress | null;
  recap: WeeklyRecap | null;
  boards: Partial<Record<Board, Leaderboard>>;
  /** A level-up to celebrate (the host shows it once). */
  levelUp: number | null;

  load: () => Promise<void>;
  loadProgress: () => Promise<void>;
  loadRecap: () => Promise<void>;
  loadBoard: (board: Board) => Promise<void>;
  clearLevelUp: () => void;
  reset: () => void;
}

let boundaryTimer: ReturnType<typeof setTimeout> | undefined;
let hiddenAt: number | null = null;

export const useEngagement = create<EngagementState>()((set) => ({
  vibeHour: null,
  level: null,
  streaksAtRisk: 0,
  progress: null,
  recap: null,
  boards: {},
  levelUp: null,

  async load() {
    if (!api.hasSession) return;
    try {
      const r = asMap(await api.get("/engagement"));
      set({ vibeHour: mapVibeHour(asMap(r.vibeHour)), level: levelProgress(asMap(r.progress)), streaksAtRisk: typeof r.streaksAtRisk === "number" ? r.streaksAtRisk : 0 });
      scheduleBoundary();
    } catch {}
  },

  async loadProgress() {
    if (!api.hasSession) return;
    try {
      const p = mapProgress(asMap(await api.get("/me/progress")));
      set({ progress: p, level: { level: p.level, xp: p.xp, levelXp: p.levelXp, nextLevelXp: p.nextLevelXp } });
    } catch {}
  },

  async loadRecap() {
    if (!api.hasSession) return;
    try {
      set({ recap: weeklyRecap(asMap(await api.get("/me/recap"))) });
    } catch {}
  },

  async loadBoard(board) {
    const b = mapLeaderboard(asMap(await api.get("/leaderboards", { board })));
    set((s) => ({ boards: { ...s.boards, [board]: b } }));
  },

  clearLevelUp: () => set({ levelUp: null }),

  reset() {
    clearTimeout(boundaryTimer);
    set({ vibeHour: null, level: null, streaksAtRisk: 0, progress: null, recap: null, boards: {}, levelUp: null });
  },
}));

/** Vibe Hour is on now (filters free, XP ×2). Components pass a ticking `now`. */
export const isVibeHour = (s: Pick<EngagementState, "vibeHour">, now = Date.now()) => vibeHourLive(s.vibeHour, now);

/** Re-reads the window just after it starts or ends (the broadcast may be missed while offline). */
function scheduleBoundary() {
  clearTimeout(boundaryTimer);
  const v = useEngagement.getState().vibeHour;
  if (!v?.startsAt || !v.endsAt) return;
  const now = Date.now();
  const next = [v.startsAt.getTime(), v.endsAt.getTime()].find((t) => t > now);
  if (next == null) return;
  // Long timers are clamped by browsers; re-check at most every 6 hours.
  boundaryTimer = setTimeout(() => void useEngagement.getState().load(), Math.min(next - now + 1500, 6 * 3600_000));
}

realtime.on(Ev.vibeHour, (d) => {
  useEngagement.setState({ vibeHour: mapVibeHour(d) });
  scheduleBoundary();
});

realtime.on(Ev.levelUp, (d) => {
  if (typeof d.level !== "number") return;
  useEngagement.setState((s) => ({ levelUp: d.level as number, level: s.level ? { ...s.level, level: d.level as number } : s.level }));
  void useEngagement.getState().loadProgress();
});

// Coming back to the tab after a while: one call refreshes the summary (the app's resume).
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") hiddenAt = Date.now();
    else if (hiddenAt != null && Date.now() - hiddenAt > 60_000) {
      hiddenAt = null;
      void useEngagement.getState().load();
    }
  });
}
