/**
 * Browser notifications for the web (the apps use push). Only used for
 * things the person asked for, and only while this tab is in the background:
 * a visible tab shows its own banner instead.
 */
export function canNotify(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Ask once, from a click (browsers ignore requests without a user gesture). */
export async function askToNotify(): Promise<boolean> {
  if (!canNotify()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/** Shows a notification if the tab is hidden and we're allowed; clicking it brings the tab back. */
export function notifyInBackground(title: string, body: string, opts: { tag?: string; onClick?: () => void } = {}): boolean {
  if (!canNotify() || Notification.permission !== "granted" || !document.hidden) return false;
  try {
    const n = new Notification(title, { body, tag: opts.tag, icon: "/icon.svg" });
    n.onclick = () => {
      window.focus();
      opts.onClick?.();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}
