export interface Tokens {
  access: string;
  refresh: string;
}

/**
 * Where the session lives between visits. The browser has no keystore, so
 * this is `localStorage` (the same origin-scoped storage any SPA uses). Swap
 * this module for an httpOnly-cookie BFF if the threat model needs it.
 */
const KEY = "vibe.session";

export const tokenStore = {
  read(): Tokens | null {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      const t = JSON.parse(raw) as Partial<Tokens>;
      return t.access && t.refresh ? { access: t.access, refresh: t.refresh } : null;
    } catch {
      return null;
    }
  },
  write(t: Tokens) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(t));
    } catch {
      // Private mode / storage full: the session lasts until the tab closes.
    }
  },
  clear() {
    try {
      window.localStorage.removeItem(KEY);
    } catch {}
  },
};
