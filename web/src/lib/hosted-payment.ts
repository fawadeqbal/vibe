import type { PaymentAction } from "./payments";

/**
 * Hosted payment pages (card gateway, JazzCash page). They open in a popup so
 * the checkout keeps its place; the page ends at /payment-return, which tells
 * this tab (postMessage) and closes. If the browser blocks the popup the page
 * opens in this tab instead and /payment-return brings people back to checkout.
 */
export const RETURN_MESSAGE = "vibe-payment-return";
const WINDOW = "vibe-payment";

export interface PaymentReturn {
  purchaseId: string | null;
  status: string | null;
}

/** True when it opened in a popup (false = this tab is navigating away). */
export function openHostedPage(action: PaymentAction): boolean {
  if (!action.url) return false;
  const popup = window.open(action.post ? "about:blank" : action.url, WINDOW, "popup,width=480,height=760");
  if (action.post) {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = action.url;
    form.target = popup ? WINDOW : "_self";
    for (const [k, v] of Object.entries(action.fields)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = k;
      input.value = v;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
    form.remove();
    return !!popup;
  }
  if (!popup) window.location.assign(action.url);
  return !!popup;
}

/** Listens for the return page reporting in from the popup. */
export function onPaymentReturn(fn: (r: PaymentReturn) => void): () => void {
  const handler = (e: MessageEvent) => {
    if (e.origin !== window.location.origin) return;
    const d = e.data as { type?: string; purchase?: string; status?: string } | null;
    if (d?.type === RETURN_MESSAGE) fn({ purchaseId: d.purchase ?? null, status: d.status ?? null });
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}
