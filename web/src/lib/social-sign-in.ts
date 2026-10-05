import { newIdempotencyKey } from "./api/client";
import { config } from "./config";
import type { SocialCredential } from "./payments";

/**
 * Google / Apple / Facebook in the browser → a credential the Vibe server
 * verifies. Google uses Google Identity Services (an ID token, like the
 * app's google_sign_in). Apple and Facebook have no web flow wired yet;
 * with NEXT_PUBLIC_DEV_SIGN_IN a backend in dev mode accepts `dev:` tokens
 * for every provider, as the app's debug builds do.
 */
export class SocialSignInError extends Error {}

/** This build can run the provider's real sign-in in the browser. */
export const canUse = (provider: string) => provider === "google" && !!config.googleClientId;

export const allowsDev = () => config.devSignIn;

/** Buttons to show: providers the server offers AND this build can run (or fake in dev). */
export const visibleProviders = (server: string[]) => server.filter((p) => canUse(p) || allowsDev());

/** Null when the person cancelled. */
export async function socialSignIn(provider: string): Promise<SocialCredential | null> {
  if (provider === "google" && canUse("google")) return { provider, idToken: await googleIdToken() };
  if (allowsDev()) return { provider, idToken: `dev:${provider}-${newIdempotencyKey().slice(0, 12)}` };
  throw new SocialSignInError(`${provider} sign-in isn't available in this build.`);
}

// ── Google Identity Services ───────────────────────────────────────────────

interface GoogleId {
  initialize(o: { client_id: string; callback: (r: { credential?: string }) => void; nonce?: string; auto_select?: boolean; cancel_on_tap_outside?: boolean; use_fedcm_for_prompt?: boolean }): void;
  prompt(listener?: (n: { isNotDisplayed?: () => boolean; isSkippedMoment?: () => boolean; isDismissedMoment?: () => boolean; getDismissedReason?: () => string }) => void): void;
  cancel(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let gisLoading: Promise<GoogleId> | null = null;

function loadGis(): Promise<GoogleId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  gisLoading ??= new Promise<GoogleId>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new SocialSignInError("Google sign-in didn't load.")));
    s.onerror = () => {
      gisLoading = null;
      reject(new SocialSignInError("Couldn't reach Google. Check your connection."));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

function googleIdToken(): Promise<string> {
  return loadGis().then(
    (id) =>
      new Promise<string>((resolve, reject) => {
        id.initialize({
          client_id: config.googleClientId,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true,
          callback: (r) => (r.credential ? resolve(r.credential) : reject(new SocialSignInError("Google sign-in didn't finish."))),
        });
        id.prompt((n) => {
          if (n.isNotDisplayed?.() || n.isSkippedMoment?.()) reject(new SocialSignInError("The browser blocked Google sign-in. Allow third-party sign-in for this site, or use your e-mail."));
          else if (n.isDismissedMoment?.() && n.getDismissedReason?.() !== "credential_returned") reject(new SocialSignInError("Google sign-in was closed."));
        });
      }),
  );
}
