/**
 * Your profile (GET /me) kept in this browser, like the app's cache: a
 * reload opens straight into Vibe and checks with the server behind it,
 * instead of waiting on the network (and showing you as signed out when
 * you're offline). Cleared with the session.
 */
const KEY = "vibe.me";

export const meCache = {
  read(): Record<string, unknown> | null {
    try {
      const raw = window.localStorage.getItem(KEY);
      const v = raw ? (JSON.parse(raw) as unknown) : null;
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  },
  write(me: Record<string, unknown>) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(me));
    } catch {}
  },
  clear() {
    try {
      window.localStorage.removeItem(KEY);
    } catch {}
  },
};
