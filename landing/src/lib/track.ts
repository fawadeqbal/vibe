/**
 * Our own traffic counter for the marketing site (admin → Marketing site).
 * Page views, "go to the app" clicks and time on site go to the API as small
 * beacons (text/plain, so no CORS preflight). No cookies, no third parties:
 * a random visitor id and the current visit live in this browser only.
 *
 * Every link into the app goes through `goToApp()` — the one place a click is
 * counted and the visit id is put on the app link, so a sign-up can be
 * credited to where the visitor came from.
 */
import { site } from "@/lib/site";

const VISITOR = "vibe.visitor";
const VISIT = "vibe.visit";
const OFF = "vibe.notrack";
/** A visit ends after 30 minutes without activity. */
const IDLE_MS = 30 * 60_000;

type Visit = { id: string; start: number; last: number };

const endpoint = site.api ? `${site.api}/v1/site/events` : null;

const randomId = (prefix: string) => {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return prefix + Array.from(bytes, (b) => (b % 36).toString(36)).join("");
};

const store = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {}
  },
};

/** `?notrack=1` turns counting off in this browser (admins' own visits), `?notrack=0` back on. */
function trackingOff(): boolean {
  const flag = new URLSearchParams(window.location.search).get("notrack");
  if (flag === "1") store.set(OFF, "1");
  if (flag === "0") store.set(OFF, null);
  return store.get(OFF) === "1" || navigator.webdriver === true;
}

function visitorId(): string {
  let id = store.get(VISITOR);
  if (!id || !/^[A-Za-z0-9_-]{8,40}$/.test(id)) {
    id = randomId("u_");
    store.set(VISITOR, id);
  }
  return id;
}

/** The current visit, or a new one after 30 idle minutes. `isNew` tells the first page view. */
function visit(): Visit & { isNew: boolean } {
  const now = Date.now();
  let v: Visit | null = null;
  try {
    v = JSON.parse(store.get(VISIT) ?? "null") as Visit | null;
  } catch {}
  const isNew = !v || typeof v.id !== "string" || now - v.last > IDLE_MS;
  const next: Visit = isNew ? { id: randomId("v_"), start: now, last: now } : { ...(v as Visit), last: now };
  store.set(VISIT, JSON.stringify(next));
  return { ...next, isNew };
}

function send(event: Record<string, unknown>) {
  if (!endpoint) return;
  const body = JSON.stringify(event);
  try {
    if (navigator.sendBeacon?.(endpoint, new Blob([body], { type: "text/plain" }))) return;
  } catch {}
  void fetch(endpoint, { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" }, mode: "no-cors" }).catch(() => {});
}

/** One page view (the first of a visit carries the referrer and the link's UTM tags). */
export function trackView() {
  if (typeof window === "undefined" || trackingOff()) return;
  const v = visit();
  send({
    k: "view",
    v: v.id,
    u: visitorId(),
    p: window.location.pathname + (v.isNew ? window.location.search : ""),
    ...(v.isNew && document.referrer ? { r: document.referrer } : {}),
    l: navigator.language,
  });
}

/** Time on site so far, when the tab is hidden or closed. */
export function trackLeave() {
  if (typeof window === "undefined" || trackingOff()) return;
  let v: Visit | null = null;
  try {
    v = JSON.parse(store.get(VISIT) ?? "null") as Visit | null;
  } catch {}
  if (!v) return;
  send({ k: "leave", v: v.id, u: visitorId(), p: window.location.pathname, s: Math.round((Date.now() - v.start) / 1000) });
}

const APP = site.links.webApp;
const isAppLink = (href: string) => href === APP || href.startsWith(`${APP}/`) || href.startsWith(`${APP}?`);
const isStoreLink = (href: string) => /play\.google\.com|apps\.apple\.com|^market:/.test(href) || href === site.links.android;

/**
 * THE way into the app: counts the click (button id, where it goes) and puts
 * the visit on the web-app link (`vid`, `b`) so a sign-up can be credited.
 * Returns the link to open. Called for every app or store link on the site.
 */
export function goToApp(button: string, href: string): string {
  if (typeof window === "undefined") return href;
  const app = isAppLink(href);
  if (!app && !isStoreLink(href)) return href;
  if (trackingOff()) return href;
  const v = visit();
  let target = href;
  if (app) {
    try {
      const u = new URL(href);
      target = u.pathname === "/" ? "/" : u.pathname;
    } catch {}
  } else {
    target = "store";
  }
  send({ k: "click", v: v.id, u: visitorId(), p: window.location.pathname, b: button.slice(0, 40), t: target });
  if (!app) return href;
  const u = new URL(href);
  u.searchParams.set("vid", v.id);
  u.searchParams.set("b", button);
  return u.toString();
}

/** Button ids look like hero_start; anything else becomes "link". */
export const ctaId = (raw: string | undefined | null) => (raw && /^[a-z0-9_]{1,40}$/.test(raw) ? raw : "link");
