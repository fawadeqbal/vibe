/**
 * The animated splash plays once when someone opens Vibe in a tab, not on
 * every reload, payment return or link back into the site. "Seen" lasts for
 * the tab (sessionStorage) and, across tabs, 30 minutes (localStorage).
 *
 * `SPLASH_SCRIPT` runs before the first paint (in <head>) and marks
 * `html[data-splash="skip"]`, so a reload never flashes the splash at all.
 */
export const SPLASH_TAB_KEY = "vibe.splash";
export const SPLASH_AT_KEY = "vibe.splashAt";
export const SPLASH_FRESH_MS = 30 * 60_000;

export const SPLASH_SCRIPT = `try{var s=sessionStorage.getItem("${SPLASH_TAB_KEY}"),a=+localStorage.getItem("${SPLASH_AT_KEY}")||0;if(s||Date.now()-a<${SPLASH_FRESH_MS})document.documentElement.dataset.splash="skip"}catch(e){}`;

/** True when this load shouldn't play the splash (set by SPLASH_SCRIPT). */
export const splashSkipped = () => typeof document !== "undefined" && document.documentElement.dataset.splash === "skip";

/** The splash has played: skip it for the rest of this tab, and for a while in new ones. */
export function markSplashSeen() {
  try {
    sessionStorage.setItem(SPLASH_TAB_KEY, "1");
    localStorage.setItem(SPLASH_AT_KEY, String(Date.now()));
  } catch {}
}
