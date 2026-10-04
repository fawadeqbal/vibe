# Vibe API

The server behind the Vibe app and its admin panel (`../admin`): accounts, the coin/gem ledger, payments and VIP, friends and chat, safety, realtime 1:1 matching with WebRTC signalling, and the back-office API (staff accounts, roles, audit log).

**Stack:** NestJS 11 · TypeScript (strict) · PostgreSQL 16 + Prisma 6 · Redis 7 · Socket.IO (Redis adapter) · pino logs · OpenAPI docs.

## Run it locally

```bash
cd apps/vibe/backend
cp .env.example .env            # dev defaults work as-is
docker compose up -d            # Postgres + Redis
npm install
npx prisma migrate deploy       # create the tables
npm run start:dev               # http://localhost:3000  ·  docs at /docs
```

Dev conveniences (all refused in production):

- **Sign-in e-mails:** with `MAIL_PROVIDER=console` codes are printed to the log instead of sent, and every code is `1234` (`OTP_FIXED_CODE`). Set `MAIL_PROVIDER=smtp` with your Gmail address and App Password to receive real e-mails.
- **Payments:** the dev gateway approves store/card purchases; JazzCash/Easypaisa ask for an OTP (any 4 digits). `DEV_PAYMENTS_FAIL_EVERY=3` declines every third charge so you can see the failure path.
- **Bots:** with `DEV_BOTS_AFTER_MS=1500`, if nobody else is online a scripted partner (24 profiles) takes the call after 1.5 s. They chat, like you, send gifts, ask to be friends and leave, the same way the app's offline mock does. That lets you test matching with one phone. Bots have no camera, so the app shows their photo.

Create the first admin-panel owner: set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` (see `.env.example`), then `npm run db:seed`. Sign in at the admin panel (`../admin`, http://localhost:3001); you'll be asked to choose a new password. Invite everyone else from **Team** in the panel.

### Sign-in e-mails with Gmail

1. Turn on 2-Step Verification for the Google account, then create an App Password (Google Account → Security → App passwords).
2. In `.env`: `MAIL_PROVIDER=smtp`, `SMTP_USER=you@gmail.com`, `SMTP_PASS=<the 16 characters>` (spaces are fine), `MAIL_FROM=Vibe <you@gmail.com>`.
3. Restart the API. The log says `SMTP ready` — or `SMTP login failed …` if the password is wrong.

Remove `OTP_FIXED_CODE` from `.env` if you want real random codes in development too.

### Prices and rules (Economy)

Coin packs, VIP plans, gifts and every rule (filter costs, rewards, gem share and value, cash-out minimum, auto-ban, minimum age…) start from the defaults in `modules/catalog/economy.ts` and can be changed at runtime from the admin panel's **Economy** page (permission "Edit prices and rules"). Each section is validated (types, ranges, unique ids, minimum age never below 18), saved in `AppSetting` as `economy.*`, and served from memory by `EconomyService`; a save reloads every API instance through Redis and pushes `catalog:updated` to every connected app. Saves are compare-and-swap: if someone changed the same values since you opened the page, you get a 409 instead of overwriting them. A purchase keeps a copy of the pack or plan it sold, so a price change never alters a payment in flight. Store prices for Google Play / App Store purchases are still set in those consoles.

### E-mail templates and messages

Every e-mail uses one branded layout filled from structured fields (subject, preview text, heading, message, highlight box, button, small print) with `{{placeholders}}`. The wording is edited in the admin panel (**E-mail templates**): the sign-in code e-mail is built in and can be reworded or reset (it must keep `{{code}}`), and staff can add their own message templates. Saved wording is cached and changes reach every API instance within a second (Redis pub/sub).

Staff send **messages** from the panel (**Messages**) to picked people (up to 1,000), a filtered group (VIP, gender, verified, countries, last active, joined dates) or everyone, by e-mail, in the app's "Messages from Vibe" inbox, or both. Sending runs in the background (one worker at a time across instances, Redis lock): 100 people per batch, resumable after a restart, and nobody gets the same message twice. E-mail is paced by the **E-mail → mail.perMinute** setting (default 60/min). Gmail allows roughly **500 e-mails a day** per account, so use a sending service (or Google Workspace) before e-mailing a large audience.

Message e-mails carry a "Stop e-mail updates" link and one-click unsubscribe headers. People can also switch e-mail updates off in the app (Profile → E-mail updates). Messages marked **important** (account, safety or legal notices) still reach them and have no unsubscribe link. Sign-in codes are always sent.

### Connect the app

```bash
# Android emulator (10.0.2.2 = your computer)
flutter run --dart-define=VIBE_API=http://10.0.2.2:3000
# Real phone on the same Wi-Fi: use your computer's LAN IP
flutter run --dart-define=VIBE_API=http://192.168.1.20:3000
```

Without `VIBE_API` the app runs fully offline on its built-in mock, exactly as before.

### Tests

```bash
npm test             # unit: economy rules, matching compatibility
npm run test:e2e     # end-to-end on a real Postgres + Redis (uses vibe_test db and Redis db 15)
npm run lint && npm run typecheck
```

The end-to-end suites cover:

- **Sign-in:** e-mailed codes (address normalisation, the e-mail content, failed-send retry), refresh-token rotation, and token-reuse detection.
- **Money:** concurrent double-taps on rewards, idempotent retries, store-receipt replay across accounts, wallet OTP payments, the VIP trial, cash-out and ledger balances.
- **Social:** friends, chat, blocks and likes.
- **Economy:** permissions, live effect on sign-up rewards and the public catalog, the realtime push, validation, stale-edit conflicts, purchases keeping the pack they sold, new packs and gifts, gem share, featured plans, reset to defaults.
- **Messaging:** template edits, required/unknown placeholders, reset, custom templates, HTML escaping in previews, test sends, permissions, picked/segment/everyone sends with exactly-once delivery, the inbox, unsubscribe links, important messages, e-mail pacing and resume, and cancelling.
- **Admin:** staff sign-in, lockout, 2FA with replay protection and recovery codes, forced password change, permission checks per endpoint, live role changes, owner safeguards, audit entries, wallet adjustments, VIP, refunds, cash-out review, maintenance mode, closed sign-ups and announcements.
- **Matching:** two live socket clients pairing, chat/like/gift/signal relay, paid filters charged on match, skip, reconnect, disconnect, reports leading to an auto-ban, and blocked users never matching.

Before running them once: `DATABASE_URL=postgresql://vibe:vibe@localhost:5432/vibe_test npx prisma migrate deploy`.

## How it's organised

```
src/
  main.ts                    bootstrap: helmet, CORS, validation, /v1 prefix, Socket.IO adapter, Swagger
  app.module.ts              wiring + global guards (auth → rate limit → roles) and error filter
  config/                    env schema (zod) — the app refuses to boot with bad/unsafe config
  common/                    shared building blocks, no business logic
    errors/                  AppError + ErrorCode (stable codes the app switches on)
    filters/                 one error shape for REST and sockets
    guards/                  JWT (global, opt out with @Public), roles, per-user rate limit
    decorators/              @CurrentUser, @Public, @Roles, @Idempotent
    interceptors/            Idempotency-Key replay (Redis)
    dto/                     cursor pagination
    utils/                   Clock (business-day aware), crypto, text helpers
  infra/                     adapters to the outside world
    prisma/                  PrismaService + tx() that composes across services
    redis/                   RedisService: JSON, counters, distributed lock
    realtime/                Socket.IO gateway, presence, RealtimeService.toUser(), Redis adapter + handshake auth
    storage/                 StorageProvider (local disk now, S3 later)
  modules/                   one folder per business capability
    catalog/                 prices and rules: defaults + validation (economy.ts), live values (EconomyService), GET /v1/catalog
    auth/                    e-mailed sign-in codes, Google/Apple, access + rotating refresh tokens
    users/                   profile, avatar upload, selfie verification, stats, history, account deletion
    wallet/                  LedgerService (the only code that moves balances), rewards, cash-outs
    payments/                purchases (store/wallet/card/bank), VIP subscriptions, webhooks
    social/                  friends, messages, blocks, "who liked you"
    moderation/              reports, strike rule, bans
    matching/                Redis queue, atomic pairing, sessions, skip cooldown, gateway, ICE servers, dev bots
    settings/                runtime settings (maintenance, sign-ups, payout review…) + maintenance guard
    announcements/           in-app announcements; GET /v1/config for app start-up
    admin/                   the back office, one folder per area:
      core/                  permissions catalog, @StaffApi/@RequirePermissions/@Audit, staff guard, audit log
      auth/                  staff sign-in (password + TOTP 2FA, recovery codes), rotating sessions
      team/ audit/           staff, roles, audit log
      dashboard/ users/ moderation/ finance/ ops/
    health/                  liveness/readiness for load balancers
prisma/                      schema + migrations (with CHECK constraints for money invariants)
test/                        e2e suites + helpers
```

Conventions that keep it maintainable:

- **Providers are interfaces.** E-mail (`infra/mail`), social sign-in, payments, payouts, ad verification, selfie verification and storage are abstract classes with a dev implementation and a real one, picked by env var. Business code never imports a vendor.
- **Money goes through one path.** `LedgerService.move()` applies a guarded `UPDATE … WHERE coins + Δ >= 0` and writes the ledger entry, with the resulting balance, in the same transaction. Postgres `CHECK` constraints back it up. Every external charge is idempotent per `Idempotency-Key` and per provider receipt.
- **Modules talk through events.** Examples are `wallet.changed`, which pushes the balance to sockets, and `user.profile-completed`, which pays the inviter. Others are `user-blocked` / `user-banned` (ends a live match) and `socket.disconnected`. No module reaches into another's tables for side effects.
- **The back office reuses the domain.** Admin endpoints call the same services as the app (ledger, moderation, VIP, cash-outs), so no business rule has a second copy. Each admin endpoint declares its permission and audit action in decorators:

  ```ts
  @Post(':id/ban')
  @RequirePermissions(P.UsersBan)
  @Audit('user.banned', { target: 'user', summary: ({ body }) => `${body.hours}h: ${body.reason}` })
  ban(...) {}
  ```
- **One error shape.** It is `{ "error": { "code", "message", "details" }, "requestId" }`, and the same `code` arrives over sockets in acks.

## Scaling

- **Stateless API instances.** All shared state (match queue, live sessions, presence, OTPs, idempotency, rate limits, locks) is in Redis; durable state is in Postgres. Run as many instances as you like behind a load balancer. Sockets need sticky sessions only if you enable the polling transport; the app uses WebSocket only.
- **Cross-instance realtime.** The Socket.IO Redis adapter delivers `toUser()` to whichever instance holds that user's socket.
- **Matching** pairs with a Lua script that removes both users from the queue only if both are still there, so two instances can never hand the same person out twice. A 1 s sweeper (guarded by a distributed lock) retries waiting users. VIP/boost get a head start in the queue score, not the front of the line.
- **Background jobs** (VIP bonus/expiry, cash-out retries, the sweeper) run under Redis locks, so exactly one instance runs each.
- **Video is peer-to-peer** (WebRTC). The server only relays signalling. Phones on different networks often can't reach each other directly, so production needs a TURN relay: `turn/` is a ready-to-run coturn server (step-by-step guide in `turn/README.md`). Set `TURN_URLS` + `TURN_SECRET` and the API hands each user a 24-hour TURN login; `npm run turn:check` tests the relay with those settings.
- **Next steps when traffic grows:** Postgres read replicas for history/feeds, S3 + CDN for media (swap `StorageProvider`), a BullMQ worker for payouts, and partitioning `LedgerEntry` by month.

## API at a glance

REST is under `/v1`. Full schema at `/docs`; OpenAPI JSON at `/docs/openapi.json`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/otp/request {email}`, `/auth/otp/verify {email, code}`, `/auth/social`, `/auth/refresh`, `/auth/logout` |
| Me | `GET/PATCH/DELETE /me`, `POST /me/avatar`, `/me/onboarding/complete`, `/me/verification`, `GET /me/stats`, `/me/matches` |
| Catalog | `GET /catalog` |
| Wallet | `GET /wallet`, `/wallet/transactions`, `POST /wallet/check-in`, `/wallet/rewards/ad`, `/wallet/rewards/profile`, `/wallet/boost`, `GET/POST /wallet/cashouts` |
| Payments | `POST /payments/purchases` (Idempotency-Key), `POST /payments/purchases/:id/confirm`, `GET /payments/purchases/:id`, `GET /vip`, `POST /vip/cancel` |
| Social | `GET /friends`, `POST /friends/:id/request · accept · decline · read`, `DELETE /friends/:id`, `GET/POST /friends/:id/messages`, `POST /friends/:id/gifts`, `GET/POST/DELETE /blocks`, `GET /likes/received` |
| Safety | `POST /reports` |
| Matching | `GET /rtc/ice-servers`, `GET /match/online` |
| Webhooks | `POST /webhooks/payments` (HMAC), `GET /webhooks/admob/ssv` |
| App config | `GET /config` (public: maintenance, min version), `GET /announcements` |
| Admin: auth | `POST /admin/auth/login`, `/login/2fa`, `/refresh`, `/logout`, `GET/PATCH /admin/auth/me`, `POST /admin/auth/password`, `/2fa/setup · enable · disable · recovery-codes`, `GET/DELETE /admin/auth/sessions` |
| Admin: team | `GET/POST /admin/staff`, `GET/PATCH /admin/staff/:id`, `POST /admin/staff/:id/reset-password · reset-2fa · sign-out`, `GET/POST /admin/roles`, `PATCH/DELETE /admin/roles/:id`, `GET /admin/permissions`, `GET /admin/audit`, `/admin/audit/actions` |
| Admin: people | `GET /admin/users`, `GET/PATCH/DELETE /admin/users/:id`, `…/ban · unban · verification · sign-out · wallet · vip · notes`, `GET …/ledger · matches · reports · purchases · cashouts · notes · audit` |
| Admin: safety | `GET /admin/reports`, `/admin/reports/stats`, `/admin/reports/by-person`, `GET /admin/reports/:id`, `POST /admin/reports/:id/resolve`, `POST /admin/reports/resolve` (bulk) |
| Admin: money | `GET /admin/finance/summary`, `GET /admin/purchases`, `/admin/purchases/:id`, `POST …/mark-paid · refund`, `GET /admin/cashouts`, `POST /admin/cashouts/:id/approve · paid · reject`, `GET /admin/ledger`, `/admin/subscriptions` |
| Inbox | `GET /inbox`, `GET /inbox/unread`, `POST /inbox/:id/read`, `POST /inbox/read-all`; public `GET/POST /email/unsubscribe?u&t` |
| Admin: messaging | `GET/POST /admin/mail-templates`, `GET /admin/mail-templates/starters`, `POST /admin/mail-templates/preview`, `GET/PUT/DELETE /admin/mail-templates/:key`, `POST …/:key/reset · test`, `POST /admin/messages/audience · preview`, `GET/POST /admin/messages`, `GET /admin/messages/:id`, `GET …/:id/deliveries`, `POST …/:id/cancel` |
| Admin: ops | `GET /admin/dashboard/summary · series`, `GET /admin/live`, `POST /admin/live/calls/:id/end`, `GET/POST /admin/announcements`, `PATCH …/:id`, `POST …/:id/publish · archive`, `GET /admin/settings`, `PUT /admin/settings/:key` |
| Admin: economy | `GET /admin/economy`, `PUT /admin/economy/:section {value, base}` (rules · packs · plans · gifts), `POST /admin/economy/:section/reset` |
| Health | `GET /health/live`, `/health/ready` |

### Socket protocol

Connect to the server root with `auth: { token: <access token> }` over WebSocket. Client events reply through an ack, `{ ok: true, data }` or `{ ok: false, error: { code, message, details } }`.

| Client → server | Payload | Notes |
|---|---|---|
| `match:join` | `{ gender: ANYONE\|WOMEN\|MEN, countryCode?, safeMode, autoBlur }` | Checks you can afford paid filters; charges only when a match is made. |
| `match:next` | `{ payToBypass? }` | Ends the call, then rejoins the queue. Returns `SKIP_COOLDOWN` with `seconds` after 5 quick skips. |
| `match:leave` / `match:end` | — | Leave the queue / hang up. |
| `match:like`, `match:chat {text}`, `match:gift {giftId, idempotencyKey?}`, `match:friend`, `match:report {reason, note?, block}`, `match:reconnect` | | |
| `rtc:signal` | `{ type: offer\|answer\|ice\|hangup, data }` | Relayed as-is to your partner. |
| `presence:ping` | — | Optional keep-alive. |

| Server → client | When |
|---|---|
| `match:searching`, `match:found {matchId, partner, role: caller\|callee, blur, sharedInterests}` | Queue and pairing; the caller sends the WebRTC offer. |
| `match:chat`, `match:liked`, `match:gift`, `match:friend-request`, `rtc:signal` | Partner actions. |
| `match:ended {reason, byMe, durationSeconds, liked, likedMe, giftsReceived}` | `reason` is `partner_left` for the other side. |
| `match:error` | Pairing failed (e.g. couldn't pay filters). |
| `wallet:updated` | Any balance change, with the full wallet view. |
| `social:friend-request`, `social:friend-accepted`, `social:friend-removed`, `social:message` | Friends and chat. |
| `account:banned {until}` | Sent just before the server disconnects you. |
| `account:warning {message}` | A moderator warned you. |
| `inbox:message {campaignId, title, body, buttonLabel, buttonUrl}` | The Vibe team sent you a message (also in `GET /inbox`). |
| `system:announcement {id, title, body}` | An announcement was published. |

## Going to production

1. Set `NODE_ENV=production`, a long random `JWT_ACCESS_SECRET` and a different `JWT_STAFF_SECRET`. The app refuses to boot with dev providers, `OTP_FIXED_CODE`, or a missing staff secret. Turn on **Require 2FA for staff** in the panel's Settings once your owners have 2FA.
2. Switch on the real providers:
   - **E-mail:** `MAIL_PROVIDER=smtp`. Gmail works to start with (`SMTP_USER` + App Password), but a personal Gmail sends at most about 500 e-mails a day. Past that, point `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` at Amazon SES, SendGrid or Mailgun (all speak SMTP), with no code changes.
   - **Sign-in:** `SOCIAL_VERIFIER=jwks` with your Google/Apple client ids.
   - **Payments:** `PAYMENTS_PROVIDER=live` with the Play service account and the App Store key. JazzCash/Easypaisa/card adapters plug into `LivePaymentProvider` once the merchant accounts exist.
   - **Ads:** `ADS_VERIFIER=admob`, and point AdMob SSV at `/v1/webhooks/admob/ssv`.
3. Run `npx prisma migrate deploy` as a release step. The Docker image also runs it on start.
4. Run the TURN relay (`turn/README.md`), set `TURN_URLS`/`TURN_SECRET`, and check it with `npm run turn:check`. Without it many calls between different networks fail (the API logs a warning at boot). Serve media from S3/CDN.
5. Build: `docker build -t vibe-api .`, then scale horizontally behind a load balancer. `GET /health/ready` is the readiness probe.
6. Run the admin panel (`../admin`, its own Dockerfile) on a private hostname behind HTTPS, ideally behind your VPN or SSO proxy as well. Keep `/v1/admin/*` reachable only from the panel's servers if your network allows it.
