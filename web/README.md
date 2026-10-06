# Vibe Web

Vibe in the browser: the Flutter app's screens rebuilt in **Next.js 16 + Tailwind CSS 4**, pixel-matched to the app (same tokens, type, icons, gradients and spacing), talking to the same Vibe API (`../backend`) over REST and Socket.IO, with real WebRTC video.

Phones get the app layout as-is (bottom tab bar, bottom sheets). From 1024px wide the tab bar becomes a navigation rail, sheets become centred cards, Chats becomes list + conversation side by side, and pages sit in a centred column.

## Run it

```bash
cd apps/vibe/web
cp .env.example .env.local      # point NEXT_PUBLIC_VIBE_API at the API
npm install
npm run dev                     # http://localhost:3002
```

The API must allow this origin: `CORS_ORIGINS` in `../backend/.env` (`*` in development is fine). With the backend's dev settings the e-mailed code is always `1234`, dev bots take the call when nobody else is online, and payments run on the dev gateway (any 4-digit OTP).

| Variable | What it does |
| --- | --- |
| `NEXT_PUBLIC_VIBE_API` | API origin, e.g. `https://api.vibe.fawadiqbal.dev`. REST is `/v1`, the socket is the root. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google sign-in (Google Identity Services). Use a *Web application* OAuth client and add the same id to the backend's `GOOGLE_CLIENT_IDS`. Empty = no Google button. |
| `NEXT_PUBLIC_DEV_SIGN_IN` | `true` shows Google/Apple/Facebook buttons that send `dev:` tokens (backend dev mode only), like the app's debug builds. |
| `NEXT_PUBLIC_FORCE_RELAY` | `true` sends every call through TURN (testing the relay). |
| `NEXT_PUBLIC_DEV_ADS` | The mock rewarded ad ("Watch an ad" in the Store). Defaults to on in `npm run dev`, off in builds; needs a backend with `ADS_VERIFIER=dev`. |

These are inlined at build time. Docker: `docker build --build-arg NEXT_PUBLIC_VIBE_API=https://api.vibe.fawadiqbal.dev -t vibe-web .` (standalone server on port 3002).

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

## How it's organised

```
src/
  app/                    routes only — thin pages that render a feature screen
    (onboarding)/         welcome, sign-in, setup, permissions
    (app)/                everything behind sign-in, wrapped in the AppShell
      match/ chats/ chats/[friendId]/ chats/inbox/ store/ vip/ checkout/ wallet/ wallet/cashout/ me/ me/edit/
      leaderboard/ u/[id]/
    payment-return/       where hosted payment pages come back to
  components/
    ui/                   design-system primitives (no data): Button family, Glass/GlassPill/RoundControl,
                          Panel/GroupCard/GroupRow, money chips, Avatar/FaceStack, Headline/SectionTitle,
                          PageHeader/AppBar, Switch, TextField/Select, ChoiceTile, overlays, brand marks…
    shared/               composed pieces used by several features: gift sheet, report sheet, selfie
                          verification, camera capture, dialogs (confirm / need-coins), video view…
    layout/               AppRuntime (session gate, splash, toasts, overlays), AppShell (bar / rail), Screen
  features/               one folder per area — onboarding, match, chats, store, wallet, profile, engagement
                          (progress & badges, leaderboard, wellbeing settings, level-up / break-reminder host)
  stores/                 zustand stores, one per Flutter provider: session, wallet, social, match, inbox, catalog,
                          follows, engagement (Vibe Hour, level, leaderboards, recap), moments, wellbeing (break reminder)
                          (+ services.ts: the one API client and socket; runtime.ts: sign-in/sign-out lifecycle;
                          ui.ts: toasts, and sheets/dialogs as promises — `await pickGift(name)`)
  lib/                    framework-free logic: API client (token refresh), realtime client, JSON mappers,
                          models, payments, checkout controller, formatting, PK validation, gradients
```

Rules the code follows:

- **No duplicated UI.** Every visual comes from `components/ui`; anything two features share lives in `components/shared`. Screens compose, they don't restyle.
- **Tokens, not values.** Colours, radii and fonts are Tailwind theme tokens in `app/globals.css` (`bg-surface`, `text-text2`, `border-line`, `rounded-card`…), named after the app's `V.*`. Type roles mirror `VT.*`: `type-display`, `type-title`, `type-title-lg` (20px+), `type-body`, `type-label`, `type-number`, `type-overline`, `type-serif`, `type-mono` — paired with a literal size (`type-title text-[15px]`).
- **Same behaviour as the app.** Stores are ports of the Flutter remote providers (same endpoints, events, idempotency keys, error codes), so a fix in one client maps line-for-line to the other.

### Matching the app pixel for pixel

- Fonts are the app's own files (Geist, Geist Mono, Instrument Serif) via `next/font/local`.
- Icons are Google's Material Icons fonts — the same glyphs as Flutter's `Icons.*`: `Icons.x_rounded` → `<Icon name="x" />`, `Icons.x_outlined` → `variant="outlined"`.
- Gradients: Flutter's `LinearGradient(topLeft → bottomRight)` runs corner to corner with bands perpendicular to that line; CSS keywords don't. `<GradientFill>` measures its box and paints the exact angle and stops (`lib/gradients.ts`, unit-tested). Squares and circles use `bg-brand` etc. (135° is exact there).
- Shadows convert Flutter's `blurRadius` to CSS (`1.1547 × r + 1`); backdrop blurs use the same sigma.
- Checked by rendering every screen at 412×892 against the app's golden screenshots (`app/test_shots/shots`).

## Web-specific notes

- **Session:** tokens live in `localStorage` (`lib/api/tokens.ts`), refreshed once on 401 like the app. Swap that module for an httpOnly-cookie backend-for-frontend if the threat model needs it.
- **Camera & mic:** `getUserMedia` (the browser asks on the permissions step). The page sends `Permissions-Policy: camera=(self), microphone=(self)`; production must be served over HTTPS.
- **Payments:** app-store billing is mobile-only, so the web shows JazzCash, Easypaisa, card and bank transfer. Hosted pages (card, JazzCash page) open in a popup and return to `/payment-return`, which reports back to the checkout tab. The API only accepts `https://` return URLs, so on plain-http localhost the checkout finishes by polling instead.
- **Rewarded ads** are AdMob, which only exists in the phone apps. Like the app's debug builds, `npm run dev` shows the Store's "Watch an ad" row with a 5-second mock ad (`components/shared/rewarded-ads.tsx`) that a backend with `ADS_VERIFIER=dev` pays for; production builds hide the row (`NEXT_PUBLIC_DEV_ADS` overrides).
- **Sign in with Apple / Facebook** need their web SDKs wired before they can be offered for real; in development they work with `NEXT_PUBLIC_DEV_SIGN_IN=true`.
- **"People online now"** uses the same estimate as the app.
- **Break reminder** (Me → Notifications & wellbeing) is client-only, as in the app: it counts time with the tab visible while you are searching or in a call, and starts over after ten minutes without (`lib/engagement.ts` `BreakTimer`, `stores/wellbeing.ts`).
- **Moments** are picked with a file input (`accept="image/*"`; JPEG, PNG or WebP up to 5 MB) and posted with `api.uploadFiles`.
