/**
 * Build-time settings (NEXT_PUBLIC_* are inlined into the bundle).
 * Mirror of the Flutter app's `ApiConfig` + `IntegrationsConfig`.
 */
const trimSlashes = (s: string) => s.replace(/\/+$/, "");

const configured = trimSlashes(process.env.NEXT_PUBLIC_VIBE_API ?? "");

// Without an API origin every call would go to this Next.js server (and 404).
// In development fall back to the backend's default port and say so.
const api = configured || (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "");
if (!configured && typeof window !== "undefined") {
  console.warn(`NEXT_PUBLIC_VIBE_API is not set${api ? `; using ${api}` : ""}. Copy .env.example to .env.local and restart \`npm run dev\`.`);
}

export const config = {
  /** The Vibe API origin, e.g. http://localhost:3000. */
  apiBase: api,
  /** REST lives under /v1; sockets connect to the root. */
  restBase: `${api}/v1`,
  socketUrl: api,
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
  /** Offer `dev:` social tokens (backend dev mode only). */
  devSignIn: ["true", "yes", "1"].includes((process.env.NEXT_PUBLIC_DEV_SIGN_IN ?? "").toLowerCase()),
  /**
   * Rewarded ads are AdMob (phones only). Like the app's debug builds, `npm run dev`
   * offers a 5-second mock ad instead, paid by a backend with ADS_VERIFIER=dev.
   * NEXT_PUBLIC_DEV_ADS=true/false overrides (default: on in development only).
   */
  devAds: process.env.NEXT_PUBLIC_DEV_ADS
    ? ["true", "yes", "1"].includes(process.env.NEXT_PUBLIC_DEV_ADS.toLowerCase())
    : process.env.NODE_ENV === "development",
  /** Every call through TURN (testing the relay). */
  forceRelay: ["true", "yes", "1"].includes((process.env.NEXT_PUBLIC_FORCE_RELAY ?? "").toLowerCase()),
} as const;
