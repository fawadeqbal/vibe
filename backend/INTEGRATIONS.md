# Integrations — going live

Every outside provider (payments, payouts, sign-in, ads, push, storage, selfie checks) is already
built. Each runs as a **built-in stand-in (dev)** until its keys are in the API's `.env`; then you
flip its switch to `live` (or `auto`) and restart. No code changes.

**Where to check:** Admin panel → Operations → **Integrations** shows every provider as `live`,
`dev` (test mode) or `off`, lists the env keys still missing, and the URLs to paste into each
provider's console. Operations → **Webhooks** shows every callback received (and lets you retry).

## The switch

| Value | Meaning |
|---|---|
| `dev` | Stand-in. No keys, no real money or messages. (Current production setting.) |
| `live` | Real provider. Anything without its keys is **off** (hidden in the app). |
| `auto` | Live where keys are set; dev for the rest — except in production, where missing = off. |

Switches: `PAYMENTS_PROVIDER`, `PAYOUTS_PROVIDER`, `SOCIAL_VERIFIER`, `ADS_VERIFIER`, `PUSH_PROVIDER`,
plus `STORAGE_DRIVER` (local | s3) and `VERIFICATION_PROVIDER` (dev | face | rekognition | manual).

Secrets that are files (private keys, service-account JSON) can be given as the literal value
(`\n` escapes are fine), as `base64:<…>`, or as `file:/path/in/container`.

Before payouts go live set `DATA_ENCRYPTION_KEY` (`openssl rand -base64 48`) **once** — it seals
payout account numbers; changing it later makes saved accounts unreadable.

After changing `.env` on the server: `docker compose up -d --force-recreate vibe-api`
(`restart` does not re-read `.env`). With `infra/deploy.ps1`, put the values in `infra/.env.prod`.

## Payments (money in)

| Method | Keys | Where to get them | Paste into the provider |
|---|---|---|---|
| Google Play | `GOOGLE_PLAY_PACKAGE`, `GOOGLE_SERVICE_ACCOUNT_JSON`; optional `GOOGLE_PLAY_RTDN_AUDIENCE`, `GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT` | Play Console → Users & permissions: invite a Google Cloud service account with *View financial data* + *Manage orders and subscriptions*; download its JSON key | Play Console → Monetization setup → Real-time developer notifications: a Pub/Sub topic whose **push** subscription points at `https://<api>/v1/webhooks/google-play` (enable authentication; audience = that URL) |
| App Store | `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (In-App Purchase key .p8), `APPLE_BUNDLE_ID`, `APPLE_APP_APPLE_ID` | App Store Connect → Users and Access → Integrations → In-App Purchase | App Store Connect → App → App Information → App Store Server Notifications **V2**: `https://<api>/v1/webhooks/app-store` (production and sandbox) |
| JazzCash | `JAZZCASH_ENV`, `JAZZCASH_MERCHANT_ID`, `JAZZCASH_PASSWORD`, `JAZZCASH_INTEGRITY_SALT` | JazzCash merchant portal (sandbox first) | Return URL and IPN URL: `https://<api>/v1/webhooks/jazzcash` |
| Easypaisa | `EASYPAISA_ENV`, `EASYPAISA_STORE_ID`, `EASYPAISA_USERNAME`, `EASYPAISA_PASSWORD`, `EASYPAISA_ACCOUNT_NUM` (+ `EASYPAISA_HASH_KEY`) | Easypay merchant onboarding | IPN URL: `https://<api>/v1/webhooks/easypaisa` |
| Card | `CARD_GATEWAY=<name>` + that gateway's keys | Your card gateway | Webhook: `https://<api>/v1/webhooks/card/<name>` |
| Bank transfer | none — Admin → Settings → Payments: bank, account title, IBAN | — | Staff confirm transfers in Finance → Purchases ("Mark paid") |

**Store products:** create these exact product ids in Play Console and App Store Connect:
`coins_<packId>` (consumable) and `vip_<planId>` (auto-renewable subscription). The live list is in
`GET /v1/payments/methods` → `store.skus` (or the Economy page ids).

**Store rules:** apps installed from Google Play / the App Store may only sell coins and VIP through
the store's own billing. Store builds of the app send `X-App-Store`, and the API then offers only
store billing unless Admin → Settings → *Local methods in Play/App Store builds* is on. JazzCash,
Easypaisa, card and bank are for builds distributed outside the stores (or a future web top-up).

**Adding a card gateway:** implement `CardGateway` in `src/modules/payments/adapters/card/gateways/<name>.gateway.ts`
(create a hosted checkout, read its status, verify its webhook signature), register it in
`card/gateways/index.ts`, set `CARD_GATEWAY=<name>`. Everything else (purchases, polling, expiry,
webhook inbox, the app's checkout page) already works. The built-in `dev` gateway shows a test page with Pay / Decline.

**How it behaves:** every purchase is recorded before the provider is called; wallet payments
(approval in the JazzCash/Easypaisa app) finish in the background; callbacks are only a nudge — the
API always re-asks the provider (inquiry / store API) before crediting; a reconciler checks pending
payments (15 s → 10 min backoff), expires abandoned ones and retries Google Play acknowledgement;
store renewals, cancellations, expiries and refunds arrive as notifications and update VIP and the
ledger. Every step is on the purchase's **Provider trail** in the admin panel.

**Check before going live:** JazzCash/Easypaisa response codes are mapped in one place each
(`JAZZCASH_CODES` in `jazzcash.adapter.ts`, `EASYPAISA_STATUS` in `easypaisa.adapter.ts`) — compare
with the code tables in your merchant documents.

## Payouts (gems cash-out)

| Rail | Keys | Notes |
|---|---|---|
| JazzCash wallet | `JAZZCASH_DISBURSE_BASE_URL`, `_CLIENT_ID`, `_CLIENT_SECRET`, `_USERNAME`, `_PASSWORD` (+ `_AES_KEY` if your API version encrypts bodies) | Separate disbursement agreement. The request/response field names live in `JAZZCASH_DISBURSE_API` (`wallet/payouts/jazzcash.payout.ts`) — check them against the spec JazzCash sends you. |
| Easypaisa wallet | `EASYPAISA_DISBURSE_BASE_URL`, `_CLIENT_ID`, `_CLIENT_SECRET`, `_ACCOUNT` | Same: check `EASYPAISA_DISBURSE_API` in `easypaisa.payout.ts`. |
| Bank (IBAN) | none | Always staff batches: Finance → Payout batches → Create batch → Download CSV → upload to your bank's bulk transfer → Mark paid. |

Safety: a cash-out is only refunded when the provider clearly says it failed (codes in
`failureCodes`). Timeouts and unknown answers stay *processing* and are re-checked, or left for
staff — never refunded blindly. Large cash-outs wait for approval (Settings → Payouts), and people
must pass selfie verification above `payouts.kycAboveUsdPerMonth`.

## Sign-in

| Provider | API keys | App build settings (see `app/INTEGRATIONS_APP.md`) |
|---|---|---|
| Google | `GOOGLE_CLIENT_IDS` = Web client id (the app's `serverClientId`) + iOS client id | Google Cloud Console → Credentials: Android client (package + SHA-1), iOS client, Web client |
| Apple | `APPLE_CLIENT_IDS` = bundle id + Services id; for token revoke on account deletion: `APPLE_TEAM_ID`, `APPLE_SIGNIN_KEY_ID`, `APPLE_SIGNIN_PRIVATE_KEY` | Android uses Apple's web flow: Services ID return URL = `https://<api>/v1/auth/apple/callback` |
| Facebook | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | Meta for Developers: app with Facebook Login; Android key hash; iOS bundle id |

A verified e-mail from Google/Apple links to an existing e-mail account; people can link/unlink
providers in their profile (one sign-in method always remains).

## Rewarded ads, push, storage, selfie checks

- **AdMob:** `ADMOB_AD_UNIT_IDS` (rewarded unit ids) → live. AdMob → app → ad unit → *Server-side verification* callback URL: `https://<api>/v1/webhooks/admob/ssv`.
- **Push (FCM):** `FCM_PROJECT_ID` + a service account with *Firebase Cloud Messaging API Admin* (`FCM_SERVICE_ACCOUNT_JSON`, or reuse `GOOGLE_SERVICE_ACCOUNT_JSON`). iOS also needs the APNs key uploaded in Firebase. People get pushes for messages, friend requests, inbox messages, payment and cash-out results — only while the app isn't open.
- **Storage:** `STORAGE_DRIVER=s3` with `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` (+ `S3_ENDPOINT`, `S3_REGION=auto` for Cloudflare R2) and a separate `S3_PRIVATE_BUCKET` with public access blocked (selfies waiting for review).
- **Selfie verification:** `VERIFICATION_PROVIDER=face` uses our own `vibe-face` container (no keys, nothing leaves the server): the app gets a pose challenge (`POST /me/verification/challenge`: look straight, then a head turn and one more move), sends one frame per step to `POST /me/verification` (`frames` + `challengeId`), and the API checks the moves were done by the same face and that it matches the profile photo (≥ `FACE_MATCH_APPROVE` → badge, ≥ `FACE_MATCH_REVIEW` → staff review). If the service is down, attempts go to staff review. Details: `../face/README.md`. Alternatively `VERIFICATION_PROVIDER=rekognition` with `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` (IAM: `rekognition:DetectFaces`, `rekognition:CompareFaces`). Matches ≥ `VERIFICATION_MIN_SIMILARITY` pass, close ones go to Users → Verifications, clear mismatches are rejected. `manual` sends every selfie to staff. Selfies are deleted once reviewed.

## Testing without keys

- Payments: wallets ask for any 4-digit OTP; the card method opens a real test page (Pay / Decline); stores accept any receipt; `DEV_PAYMENTS_FAIL_EVERY=3` declines every third charge.
- Payouts: wallet rails pay instantly; bank goes through batches as in live.
- Sign-in: tokens `dev:<id>[:<name>[:<verified email>]]`; debug app builds show "(dev)" buttons.
- Live adapters are covered by tests against fake provider servers (`test/payments-live.e2e-spec.ts`, `*.spec.ts` next to each adapter).
