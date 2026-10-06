# Referrals v2 + Affiliates — design (Oct 2026)

Goal: grow users through (1) friends inviting friends and (2) creator partners (TikTok/YouTube/Instagram) who earn money for the paying users they bring. Both share one attribution pipeline.

Applies to: backend, admin panel, Flutter app, web app, landing site.

## Today (found while designing)

- Every user has `inviteCode`; `/i/<code>` on the landing site 302s to `/?invite=<code>` and the code is **dropped there**. Neither the app nor the web ever sends `inviteCode` at sign-up (the auth DTOs accept it), so referrals are effectively not attributed today.
- Reward: inviter gets `inviteRewardCoins` (100) when the invitee completes their profile (`RewardsService`, `User.inviteRewardedAt`). One-sided, easy to farm (coins → gifts → gems → cash).

---

## 1. Attribution pipeline (shared)

Codes: user invite codes (existing, 6–10 uppercase alnum) and affiliate vanity codes (3–20 chars `[A-Za-z0-9_]`, stored upper-case, unique across both). `resolveCode(code)` → `{ kind: 'user', inviterId } | { kind: 'affiliate', affiliateId, userId } | null`.

Link format: `https://vibe.fawadiqbal.dev/i/<CODE>` with optional `?s=<source>` (tiktok, youtube, instagram, whatsapp…; `[a-z0-9_-]{1,24}`).

Steps:
1. **Landing `/i/<code>`** — static invite page (landing is a static export served by nginx; nginx serves `/i/<code>` → `/i/index.html`, JS reads the code from the path). It calls `GET /v1/referrals/preview/:code?s=` (public, rate-limited, records a click) and shows "Ali invited you to Vibe · get 50 free coins" (affiliate: their display name + avatar). Buttons:
   - **Get it on Google Play** → `https://play.google.com/store/apps/details?id=com.pingcrood.vibe_app&referrer=<urlencoded "vibe_ref=CODE&utm_source=S">`
   - **Use Vibe on the web** → `https://app.vibe.fawadiqbal.dev/?ref=CODE&s=S`
   - "Already have the app? Open it" → `vibe://invite?code=CODE` (only useful for existing users; harmless).
   Unknown code → generic page with the same buttons, no name. `noindex`.
2. **Android app** — on first launch read the Play Install Referrer once, parse `vibe_ref` (+ `utm_source`), keep it locally until sign-up. Also accept `vibe://invite?code=` deep links and `https://vibe.fawadiqbal.dev/i/<code>` app links before sign-up.
3. **Web app** — read `?ref=` / `?s=` on any page, keep in localStorage (30 days), strip from the URL.
4. **Sign-up** — app/web send `inviteCode`, `inviteSource` and `deviceId` (random install id: app = secure storage UUID generated once; web = localStorage UUID) with `POST /auth/otp/verify` and social sign-in. Only used when the account is created.
5. **Late entry** — "Have an invite code?" (profile setup step and Me → Invite friends) → `POST /v1/referrals/claim { code }` allowed within **48 h** of sign-up, once, not your own code, not your own affiliate.

Server creates one `Referral` per invitee (unique inviteeId) at sign-up / claim.

## 2. Referrals v2 (users)

### Rules (economy group `referrals`, "Invites and referrals")
| key | default | kind |
|---|---|---|
| `inviteRewardCoins` (existing, moved to this group) | 100 | coins — inviter, on activation |
| `inviteeRewardCoins` | 50 | coins — new user, on activation |
| `referralActivationCalls` | 3 | count 0–20 — calls ≥ 60 s the invitee must have |
| `referralRequireVerified` | 1 | count 0–1 (1 = invitee must pass selfie verification) |
| `referralHoldHours` | 24 | hours 0–720 — wait after qualifying before paying |
| `maxReferralRewardsPerDay` | 10 | count 1–1000 — per inviter |
| `referralMilestone1` / `referralMilestone1VipDays` | 3 / 7 | count / days |
| `referralMilestone2` / `referralMilestone2VipDays` | 10 / 30 | |
| `referralMilestone3` / `referralMilestone3Coins` | 25 / 1000 | count / coins |

(Add a `days` RuleKind if needed; admin renders it.)

### Model
`Referral { id, inviterId?, affiliateId?, inviteeId @unique, code, source ('link'|'install'|'code'|'web'), channel String? (s=), status PENDING|QUALIFIED|REWARDED|REJECTED, rejectReason?, deviceHash?, ip?, qualifiedAt?, rewardedAt?, inviterCoins Int @default(0), inviteeCoins Int @default(0), createdAt }` + indexes (inviterId, createdAt), (affiliateId, createdAt), (status, qualifiedAt).
`User.signupDeviceHash String?` (sha256 of deviceId + server pepper). Keep `User.invitedById` in sync for users (existing admin uses it). Migration back-fills `Referral` rows from existing `invitedById` (REWARDED when `inviteRewardedAt` set, else PENDING).

### Lifecycle
- **PENDING** at sign-up. Fraud checks at creation → **REJECTED** immediately with a reason when: invitee device hash equals the inviter's signup device hash or any device hash of the inviter's previous referrals' inviter… (keep it simple: same device as inviter, or ≥ 3 referrals from the same device hash in 30 days → `same_device`), invitee is a bot.
- **QUALIFIED** when invitee meets activation (verified if required, `goodCallsCount ≥ referralActivationCalls`, not banned). Checked on the events that change those (verification approved, match ended / good call counted) — reuse existing events.
- **REWARDED** after `referralHoldHours` (interval job under Redis lock): invitee still active and not banned; inviter (user referrals) not over `maxReferralRewardsPerDay` (otherwise wait for tomorrow). Pays inviter `inviteRewardCoins` (ledger "Invited <name>", idempotency `referral:<id>:inviter`) and invitee `inviteeRewardCoins` ("Welcome bonus from <inviter>", `referral:<id>:invitee`). Affiliate referrals: invitee coins yes, no inviter coins (affiliates get money, §3).
- Milestones (user inviters, counted on REWARDED): reaching milestone 1/2 grants VIP days (extend existing VIP the same way staff "VIP grant" does), milestone 3 grants coins; idempotent per milestone. Badge `ambassador` 🎖️ "Ambassador" — 10 rewarded referrals — added to the badge list (11 badges).
- Remove the old "complete profile → inviter coins" path (replaced). Keep the profile-complete bonus for the user themself.
- Realtime `referral:updated { referral }` to the inviter; pushes (category `social`): "Ali joined Vibe with your invite 🎉" (on sign-up), "+100 coins — Ali is now active" (on reward), "You unlocked 7 days of VIP 👑" (milestone).

### API
- `GET /v1/referrals/preview/:code?s=` (public) → `{ valid, kind: 'user'|'affiliate', name, avatarUrl, inviteeCoins }` (first name only); counts a click (per code/channel/day; dedupe per IP per hour).
- `GET /v1/referrals` → `{ code, link, rewards: { inviterCoins, inviteeCoins, activationCalls, requireVerified }, stats: { joined, pending, rewarded, rejected, coinsEarned }, milestones: [{ count, reward: { kind: 'vip'|'coins', amount }, reached }], next: { count, remaining } | null, people: [{ profile: PublicProfile, status, steps: { verified: bool, calls: n, callsNeeded: n }, createdAt, rewardedAt }] (latest 50) }`.
- `POST /v1/referrals/claim { code }` → the referral `{ status, inviter?: { name } }`; errors `INVITE_CODE_INVALID` 404, `INVITE_TOO_LATE` 409, `INVITE_ALREADY_USED` 409, `INVITE_SELF` 403.
- `GET /me` gains `invitedBy: { name } | null` and `referralClaimable: boolean` (no referral yet and < 48 h old).

### UI (app + web)
- **Invite friends screen** (from Store earn row "Invite a friend", Me, and a gift-icon in Chats header): hero "Give 50, get 100 coins", how it works (3 steps: share → they verify + 3 calls → you both get coins), share buttons (WhatsApp first, then system share / copy link), milestones track (3 · 10 · 25), list of invited people with progress chips ("Verified ✓ · 2/3 calls"), totals.
- **Share cards**: share from Progress card ("I'm Level 12 on Vibe"), streak sheet ("Our 30-day streak 🔥"), and match recap after a mutual like — each shares a rendered image card + text with the invite link. App: `share_plus` with a PNG rendered from a widget (RepaintBoundary); web: Web Share API with files when supported (canvas-rendered PNG), else text + link and copy.
- Profile setup + Me: "Have an invite code?" field while `referralClaimable`.
- Welcome screen (app/web) when an invite code was captured: "Ali invited you · finish setup to earn 50 coins".

## 3. Affiliates (creator partners)

### Rules (economy group `affiliates`)
| key | default | kind |
|---|---|---|
| `affiliateRevSharePercent` | 20 | count 0–80 — default share of referred users' purchases |
| `affiliateCommissionMonths` | 6 | count 1–36 — months after the user signs up |
| `affiliateCpaUsdCents` | 10 | cents 0–10000 — per referred user who qualifies |
| `affiliateStoreFeePercent` | 15 | count 0–50 — taken off Play/App Store purchases before the share |
| `affiliateHoldDays` | 14 | count 0–90 — before commissions become available |
| `affiliateMinPayoutUsdCents` | 1000 | cents |

### Model
- `Affiliate { id, userId @unique, code @unique, displayName, status PENDING|ACTIVE|SUSPENDED|REJECTED, revSharePercent Int?, cpaUsdCents Int? (null = rule default), channels Json ([{ platform, url, followers }]), note (applicant message), staffNote?, appliedAt, decidedAt?, decidedById? }`.
- `AffiliateCommission { id, affiliateId, referralId, purchaseId? @unique per kind, kind REVSHARE|CPA, baseUsdCents, usdCents, status PENDING|AVAILABLE|PAID|REVERSED|HELD, availableAt, payoutId?, createdAt }` (CPA unique per referral).
- `AffiliatePayout { id, affiliateId, usdCents, amountPkr, payoutAccountId, accountMasked, method, status REQUESTED|PAID|REJECTED, reference?, failureReason?, createdAt, decidedAt?, decidedById? }`.
- `ReferralClick { code, channel, day (date), clicks Int, @@id([code, channel, day]) }`.

### Lifecycle
- Apply (web): `POST /v1/affiliate/apply { displayName, code, channels[1..5], note }` — signed-in, verified users only (`VERIFICATION_REQUIRED` 403), one application; code availability `GET /v1/affiliate/code-available?code=`.
- Staff approve/reject/suspend in admin (permission `ops.affiliates`, sensitive, on Owner/Admin/Finance roles; viewing needs `ops.affiliates.view` or reuse an existing view permission — follow the existing permission pattern). Approve can set code, revShare %, CPA. Audited.
- Commissions:
  - **REVSHARE** on every SUCCEEDED purchase by a referred user (referral.affiliateId, affiliate ACTIVE, purchase within `affiliateCommissionMonths` of invitee sign-up): base = `usdCents` (minus store fee % for Play/App Store methods), amount = base × share%. `availableAt = now + holdDays`.
  - **CPA** when the referral becomes QUALIFIED.
  - Refund (purchase refunded) → its commission REVERSED (if already PAID, create a negative adjustment row so balance goes down).
  - Interval job: PENDING → AVAILABLE when `availableAt` passed. Affiliate SUSPENDED → new commissions HELD.
- Payout: `POST /v1/affiliate/payouts { payoutAccountId }` — whole AVAILABLE balance ≥ min, uses the user's saved payout accounts (existing cash-out accounts), PKR at the same USD→PKR rate cash-outs use; commissions move to PAID-pending (linked to payout). Staff mark paid (reference) or reject (commissions back to AVAILABLE) in admin. One open payout at a time.
- Fraud flags (computed, shown in admin and used to auto-HOLD new commissions when severe): share of referred users with 0 calls after 7 days (> 70%), same-device clusters (≥ 3 referred users per device hash), refund rate (> 20%), clicks→sign-ups ratio anomalies.

### API (affiliate — signed-in user)
- `GET /v1/affiliate` → `{ status: 'none'|'PENDING'|'ACTIVE'|'SUSPENDED'|'REJECTED', affiliate?: { code, displayName, link, revSharePercent, cpaUsdCents, commissionMonths, holdDays, minPayoutUsdCents }, balance?: { pendingUsdCents, availableUsdCents, paidUsdCents }, openPayout? }`.
- `GET /v1/affiliate/stats?days=7|30|90` → `{ totals: { clicks, signups, qualified, payingUsers, revenueUsdCents, earnedUsdCents }, daily: [{ day, clicks, signups, qualified, revenueUsdCents, earnedUsdCents }], byChannel: [{ channel, clicks, signups, qualified, earnedUsdCents }] }`.
- `GET /v1/affiliate/commissions?cursor` → cursor list `{ id, kind, usdCents, status, availableAt, createdAt, user: { name } }` (first name only).
- `GET /v1/affiliate/payouts`, `POST /v1/affiliate/payouts { payoutAccountId }`.

### Admin API + UI
- `/admin/affiliates` list (status filter, search), detail (profile, channels, stats, flags, referred users, commissions, payouts, staff note), actions approve/reject/suspend/reactivate/edit terms. `/admin/affiliate-payouts` queue (mark paid with reference / reject with reason).
- `/admin/referrals` list (status filter incl. REJECTED + reason, search by code/user), action "approve anyway" (REJECTED → PENDING, re-evaluated) and "reject" (PENDING/QUALIFIED → REJECTED).
- User detail: "Referrals" section (invited by, people they invited with statuses, affiliate status link).
- Nav group "Growth": Referrals, Affiliates, Affiliate payouts. Dashboard tile: referred sign-ups (7 d).

### UI
- **Web `/partner`** (also linked from Me → "Creator partner program"): landing/apply form when `none`; status card when PENDING/REJECTED; dashboard when ACTIVE: link builder (code + source chips → copy link / QR), balance cards (pending · available · paid), stats chart (7/30/90 d: clicks, sign-ups, active users, earnings), by-channel table, commissions list, request payout (pick payout account, reuse the web cash-out account UI).
- **App**: Me → "Creator partner program" row → opens the web `/partner` page in the browser (url_launcher). Active affiliates also see their affiliate link on the Invite screen.

## 4. Tests
Backend unit: code resolution, fraud checks, qualification, milestone math, commission math (store fee, months window, refunds), payout balance. E2E: sign-up with code (OTP + social), claim within/after 48 h, self/duplicate, activation → hold → reward (both sides), daily cap, milestones VIP/coins, same-device rejection, preview + click counting, affiliate apply/approve/link/sign-up/CPA/revshare/refund reversal/available/payout/mark paid/reject, admin referrals override, permissions. Admin: unit + Playwright for affiliates approve + payouts. App: widget tests (invite screen, claim field, share card render), install referrer parsing (pure). Web: vitest (ref capture/storage, link builder, money formatting) + build + Playwright walkthrough (landing page → web sign-up with ref → invite screen → partner apply → admin approve → dashboard).
