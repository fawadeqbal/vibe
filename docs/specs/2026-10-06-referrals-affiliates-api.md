# Referrals v2 + Affiliates — server API contract (Oct 2026)

Implements `docs/specs/2026-10-06-referrals-affiliates-design.md` (backend + admin). REST under `/v1`; errors are `{ error: { code, message, details? } }`. Money for partners is **USD cents** (`…UsdCents`); coins are whole coins. "Day" = business day (UTC+5).

## Links and attribution

- Share link: `https://vibe.fawadiqbal.dev/i/<CODE>[?s=<channel>]` (`INVITE_LINK_BASE` on the server). `CODE` = a user's invite code (6–10 upper-case letters/digits) or a creator-partner code (3–20 `[A-Za-z0-9_]`, stored upper-case). Codes are case-insensitive everywhere; one namespace for both kinds. `channel` = `[a-z0-9_-]{1,24}` (lower-cased by the server).
- Play Store: `https://play.google.com/store/apps/details?id=com.pingcrood.vibe_app&referrer=<urlencoded "vibe_ref=CODE&utm_source=S">`. Web: `https://app.vibe.fawadiqbal.dev/?ref=CODE&s=S`. Deep link: `vibe://invite?code=CODE`.
- Send the captured code with the **account-creating** sign-in (ignored for existing accounts):

| Field (OTP verify + social sign-in) | Rule |
|---|---|
| `inviteCode?` | `^[A-Za-z0-9_]{3,20}$` (else 400). Unknown/inactive codes are silently ignored. |
| `inviteSource?` | the link's `s` / `utm_source`: `^[a-z0-9_-]{1,24}$` after trim + lower-case (else 400). Stored as the referral `channel`. |
| `inviteVia?` | `'link' \| 'install' \| 'web'` — how the code was captured (app/deep link, Play install referrer, web app). Default `link`. Late claims are `code`. |
| `deviceId?` | random install id, `^[A-Za-z0-9._:-]{8,128}$` (app: secure-storage UUID; web: localStorage UUID). Stored only as HMAC-SHA256 with a server pepper. |

`POST /auth/otp/verify { email, code, inviteCode?, inviteSource?, inviteVia?, deviceId? }` · `POST /auth/social { provider, idToken…, inviteCode?, inviteSource?, inviteVia?, deviceId? }`. The referral exists before the sign-in response is sent, so `user.invitedBy` in that response is already set.

## REST — new (app / web, signed in unless marked public)

| Method / path | Body | Response |
|---|---|---|
| `GET /referrals/preview/:code?s=` **public**, rate-limited (30/min/IP) | — | `{ valid: boolean, kind: 'user'\|'affiliate'\|null, name: string\|null, avatarUrl: string\|null, inviteeCoins: number }`. `name` = inviter's **first name** (partner: display name); unknown/malformed code → `valid: false`, nulls. Counts a link visit for valid codes (per code · channel · business day; one per IP per hour; no `s` → channel `direct`). |
| `GET /referrals` | — | `{ code, link, rewards: { inviterCoins, inviteeCoins, activationCalls, requireVerified: boolean, holdHours }, stats: { joined, pending, rewarded, rejected, coinsEarned }, milestones: [{ count, reward: { kind: 'vip'\|'coins', amount }, reached: boolean }] (3, by count), next: { count, remaining } \| null, people: ReferralPerson[] (latest 50, newest first), affiliate: { code, link } \| null }` — `affiliate` only for ACTIVE partners (show their partner link on the Invite screen). `pending` = PENDING + QUALIFIED. `coinsEarned` = coins from rewarded referrals (milestone coins not included). `reward.amount` = VIP days or coins. |
| `POST /referrals/claim` | `{ code }` (`^[A-Za-z0-9_]{3,20}$`) | 200 `{ id, status: ReferralStatus, rejectReason: string\|null, inviter: { name }, kind: 'user'\|'affiliate', inviteeCoins }`. Errors: 404 `INVITE_CODE_INVALID`; 409 `INVITE_TOO_LATE` (account > 48 h old); 409 `INVITE_ALREADY_USED`; 403 `INVITE_SELF` (own code, own partner code, or the code of someone you invited). Rate-limited 10/min. |
| `GET /affiliate` | — | `{ status: 'none' }` or `{ status: 'PENDING'\|'ACTIVE'\|'SUSPENDED'\|'REJECTED', affiliate: { code, displayName, link, revSharePercent, cpaUsdCents, commissionMonths, holdDays, minPayoutUsdCents, appliedAt: ISO, decisionReason: string\|null }, balance: { pendingUsdCents, availableUsdCents, requestedUsdCents, paidUsdCents }, openPayout: AffiliatePayout\|null }`. `decisionReason` = staff's reason when REJECTED / SUSPENDED. `availableUsdCents` can be negative after a refund of an already-paid commission. `requestedUsdCents` = money in the open payout. |
| `GET /affiliate/code-available?code=` | — | `{ code: string\|null (normalised), available: boolean, reason: 'invalid'\|'reserved'\|'taken'\|null }` |
| `POST /affiliate/apply` | `{ displayName (2–40), code (3–20 [A-Za-z0-9_]), channels: [{ platform: 'tiktok'\|'youtube'\|'instagram'\|'facebook'\|'x'\|'snapchat'\|'twitch'\|'other', url: https URL ≤300, followers: int 0…1e9 }] (1–5), note?: ≤1000 }` | 201 = `GET /affiliate` body (status `PENDING`). Errors: 403 `VERIFICATION_REQUIRED`; 409 `AFFILIATE_EXISTS` (one application per account, also after a rejection); 409 `AFFILIATE_CODE_TAKEN` (`details.reason`: invalid/reserved/taken); 400 validation. |
| `GET /affiliate/stats?days=7\|30\|90` (default 30) | — | `{ days, totals: { clicks, signups, qualified, payingUsers, revenueUsdCents, earnedUsdCents }, daily: [{ day: 'YYYY-MM-DD', clicks, signups, qualified, revenueUsdCents, earnedUsdCents }] (oldest → today, zero-filled), byChannel: [{ channel, clicks, signups, qualified, earnedUsdCents }] }`. `revenueUsdCents` = successful purchases by referred users (list price); `earnedUsdCents` excludes reversed commissions. 403 `AFFILIATE_NOT_ACTIVE` without a partner account; 400 for other `days`. |
| `GET /affiliate/commissions?cursor&limit` | — | `{ items: [{ id, kind: 'REVSHARE'\|'CPA', usdCents, baseUsdCents, status: 'PENDING'\|'AVAILABLE'\|'PAID'\|'REVERSED'\|'HELD', availableAt: ISO, createdAt: ISO, adjustment: boolean, user: { name } }], nextCursor }` — `user.name` is the first name only; `adjustment` rows are negative (refund of a paid commission). |
| `GET /affiliate/payouts` | — | `AffiliatePayout[]` (latest 50) |
| `POST /affiliate/payouts` | `{ payoutAccountId }` (a saved account from `GET /wallet/payout-accounts`) | 201 `AffiliatePayout` — the whole available balance, PKR at the cash-out rate (`payments.usdToPkr`). Errors: 403 `AFFILIATE_NOT_ACTIVE` (not a partner / not ACTIVE); 404 payout account; 400 `AFFILIATE_BELOW_MINIMUM` (`details: { minimumUsdCents, availableUsdCents }`); 409 `AFFILIATE_PAYOUT_OPEN`. |

`ReferralPerson = { id, profile: PublicProfile, status: ReferralStatus, rejectReason: string|null, steps: { verified: boolean, verifyNeeded: boolean, calls: number (capped at callsNeeded), callsNeeded: number }, coins: number (inviter coins paid), createdAt: ISO, qualifiedAt: ISO|null, rewardedAt: ISO|null }` — chips like "Verified ✓ · 2/3 calls".

`ReferralStatus = 'PENDING' | 'QUALIFIED' | 'REWARDED' | 'REJECTED'`. `rejectReason`: `same_device`, `bot`, `invitee_deleted`, or `staff: <text>`.

`AffiliatePayout = { id, usdCents, amountPkr, method: 'JAZZCASH'|'EASYPAISA'|'BANK', accountMasked, status: 'REQUESTED'|'PAID'|'REJECTED', reference: string|null, failureReason: string|null, createdAt: ISO, decidedAt: ISO|null }`.

## REST — changed

- `GET /me`, `PATCH /me`, `POST /me/onboarding/complete`, `POST /me/verification` and the `user` in sign-in responses gain `invitedBy: { name: string, status: ReferralStatus } | null` (inviter's first name or the partner's display name) and `referralClaimable: boolean` (no referral yet and the account is < 48 h old → show "Have an invite code?").
- `GET /me/progress` `badges`: 11 badges — `ambassador` 🎖️ "Ambassador" (target 10 rewarded referrals) appended after `night_owl`. `GET /users/:id/view` `badges` may include `ambassador`.
- `GET /catalog` `economy` gains: `inviteeRewardCoins` 50, `referralActivationCalls` 3, `referralRequireVerified` 1 (0/1), `referralHoldHours` 24, `maxReferralRewardsPerDay` 10, `referralMilestone1` 3 / `referralMilestone1VipDays` 7, `referralMilestone2` 10 / `referralMilestone2VipDays` 30, `referralMilestone3` 25 / `referralMilestone3Coins` 1000, `affiliateRevSharePercent` 20, `affiliateCommissionMonths` 6, `affiliateCpaUsdCents` 10, `affiliateStoreFeePercent` 15, `affiliateHoldDays` 14, `affiliateMinPayoutUsdCents` 1000. `inviteRewardCoins` (100) keeps its name and value.
- Completing the profile no longer pays the inviter (`POST /wallet/rewards/profile` still pays the user's own bonus).

## Sockets — server → client (new)

- `referral:updated { referral: ReferralPerson, event: 'joined'|'qualified'|'rewarded'|'rejected', coins: number }` — to the inviter (user referrals only). `joined` goes out once: at sign-up when the new user already has a name (social sign-in), otherwise when they finish profile setup (`POST /me/onboarding/complete`). `rewarded` comes with a `wallet:updated`.
- `referral:milestone { index: 1|2|3, count, reward: { kind: 'vip'|'coins', amount } }` — to the inviter, once per milestone ever.
- `affiliate:updated { status, event: 'approved'|'rejected'|'suspended'|'reactivated'|'payout_paid'|'payout_rejected', payout?: AffiliatePayout }` — to the partner. Refresh `GET /affiliate`.
- The new user's welcome coins arrive as a normal `wallet:updated` (ledger title "Welcome bonus from <name>").

## Pushes (offline only, via the push bridge)

| Event | Title / body | Category | `data.route` |
|---|---|---|---|
| referral joined | "Ali joined Vibe with your invite 🎉" / "When they verify and have 3 calls, you both get coins." | `social` | `invite` (+ `referralId`) |
| referral rewarded | "+100 coins" / "Ali is now active on Vibe." | `social` | `invite` (+ `referralId`) |
| milestone | "You unlocked 7 days of VIP 👑" or "+1,000 coins 🎖️" / "N friends joined Vibe with your invite." | `social` | `invite` |
| partner approved / rejected / suspended | "You're a Vibe creator partner 🎉" … | `social` | `partner` |
| partner payout paid / returned | "Partner payout sent 💸" / "Partner payout returned" | `payments` | `partner` (+ `payoutId`) |

New routes for the apps: `invite` (Invite friends screen), `partner` (web `/partner`; the app opens it in the browser).

## Errors (new codes)

`INVITE_CODE_INVALID` 404, `INVITE_TOO_LATE` 409, `INVITE_ALREADY_USED` 409, `INVITE_SELF` 403, `VERIFICATION_REQUIRED` 403, `AFFILIATE_CODE_TAKEN` 409 (`details.reason`), `AFFILIATE_EXISTS` 409, `AFFILIATE_NOT_ACTIVE` 403, `AFFILIATE_PAYOUT_OPEN` 409, `AFFILIATE_BELOW_MINIMUM` 400 (`details.minimumUsdCents`, `details.availableUsdCents`).

## Admin API (`/v1/admin`, staff token)

Permissions (group "Growth"): `ops.affiliates.view` (view referrals, partners, payouts — Owner, Admin, Finance, Support, Viewer, Moderator), `ops.referrals` (approve anyway / reject a referral — Owner, Admin, Finance, Moderator), `ops.affiliates` (sensitive: decide partners, terms, see payout accounts, pay payouts — Owner, Admin, Finance). All writes are audited.

| Method / path | Permission | Body → response |
|---|---|---|
| `GET /admin/referrals?status=PENDING,…&kind=user\|affiliate&affiliateId&q&cursor&limit` | view | page of `{ id, code, kind, source, channel, status, rejectReason, inviterCoins, inviteeCoins, device (8 hex chars of the hash), ip, createdAt, qualifiedAt, rewardedAt, invitee, inviter, affiliate: { id, code, displayName }\|null, steps }` (`invitee`/`inviter` = `{ id, name, avatarUrl, verified, goodCallsCount, status }`); `q` matches code, ids, names, e-mail |
| `POST /admin/referrals/:id/approve` | referrals | REJECTED → PENDING, re-checked at once → the row (409 otherwise). Audit `referral.approved` |
| `POST /admin/referrals/:id/reject` | referrals | `{ reason (3–200) }` PENDING/QUALIFIED → REJECTED (`staff: reason`); a partner's commissions for it are reversed → the row. Audit `referral.rejected` |
| `GET /admin/users/:id/referrals` | users.view | `{ invitedBy: row\|null, invited: { counts: { PENDING?, QUALIFIED?, REWARDED?, REJECTED? }, items: row[] (latest 50) }, affiliate: { id, code, status, displayName }\|null }` |
| `GET /admin/affiliates?status&q&cursor&limit` | view | page of `{ id, userId, code, displayName, status, link, revSharePercent, cpaUsdCents (effective), customTerms, channels, appliedAt, decidedAt, user, referrals }` |
| `GET /admin/affiliates/:id` | view | summary + `{ user, note, staffNote, decisionReason, decidedBy, defaults: { revSharePercent, cpaUsdCents }, stats (30 d, same shape as /affiliate/stats), flags: [{ key: idle_users\|device_clusters\|refunds\|click_ratio, level: warn\|severe, message, value }], balance, referred (50), commissions (50, with purchaseId, payoutId, user {id,name}), payouts (20) }` |
| `GET /admin/affiliates/:id/stats?days=7\|30\|90` | view | stats |
| `POST /admin/affiliates/:id/approve` | affiliates | `{ code?, revSharePercent? (0–80\|null), cpaUsdCents? (0–10000\|null) }` PENDING/REJECTED → ACTIVE → detail |
| `POST /admin/affiliates/:id/reject` · `/suspend` | affiliates | `{ reason }` → detail (reason shown to the partner) |
| `POST /admin/affiliates/:id/reactivate` | affiliates | SUSPENDED → ACTIVE; held commissions resume their hold → detail |
| `POST /admin/affiliates/:id/release-held` | affiliates | → `{ released }` |
| `PATCH /admin/affiliates/:id` | affiliates | `{ code?, displayName?, revSharePercent?\|null, cpaUsdCents?\|null, staffNote?\|null }` → detail (null terms = economy default) |
| `GET /admin/affiliate-payouts?status&q&cursor&limit` | view | page of `AffiliatePayout & { affiliate: { id, code, displayName, status, user } }` |
| `GET /admin/affiliate-payouts/:id/destination` | affiliates | `{ method, account, holderName, bankName? }` (audited) |
| `POST /admin/affiliate-payouts/:id/paid` | affiliates | `{ reference }` REQUESTED → PAID → payout |
| `POST /admin/affiliate-payouts/:id/reject` | affiliates | `{ reason }` REQUESTED → REJECTED, its commissions back to AVAILABLE → payout |

`GET /admin/dashboard/summary` gains `growth: { referredSignups7d, partnerSignups7d, referralsRewarded7d }` and `queues.partnersPending`, `queues.partnerPayoutsOpen`. `GET /admin/economy` groups gain `referrals` and `affiliates` (rule kinds `days` and `flag` added; `cents` fields may carry `whole: true`).

## Behaviour notes

- **Lifecycle.** PENDING at sign-up/claim → QUALIFIED when the new user is ACTIVE, not banned, selfie-verified (if `referralRequireVerified`), and has `referralActivationCalls` calls of ≥ 60 s (checked on verification approved, on every call end, at creation and on "approve anyway") → REWARDED by a 1-minute job once `referralHoldHours` passed: inviter `inviteRewardCoins` ("Invited <name>", ledger key `referral:<id>:inviter`) and new user `inviteeRewardCoins` ("Welcome bonus from <name>", `referral:<id>:invitee`). A banned new user waits; a deleted one is rejected (`invitee_deleted`). An inviter at `maxReferralRewardsPerDay` (business day) waits until tomorrow. Partner referrals: the new user gets coins, the partner gets no coins.
- **Fraud.** Rejected at creation when the new user's device hash equals the inviter's (or partner user's) sign-up device, or when it would be the 3rd referred sign-up from one device in 30 days (`same_device`); dev bots → `bot`. No `deviceId` → no device checks.
- **Milestones** (user inviters): counted on REWARDED; reaching milestone 1/2 extends VIP like a staff grant (ledger "VIP N days · M friends joined"), milestone 3 pays coins; each milestone index is granted once per user ever (ledger key `referral-milestone-<n>`), even if staff later change the counts.
- **Commissions.** CPA (`cpaUsdCents`) when a partner referral becomes QUALIFIED (once per referral). Rev-share on every successful purchase (incl. store subscription renewals) by a referred user within `affiliateCommissionMonths` calendar months of their sign-up: base = price, minus `affiliateStoreFeePercent` for Google Play / App Store; amount = ⌊base × share%⌋. New commissions are PENDING for `affiliateHoldDays`, then AVAILABLE; HELD while the partner is SUSPENDED or has a severe fraud flag (staff release). Refund → REVERSED, or a negative AVAILABLE adjustment if it was already in a payout. Staff rejecting a referral reverses its commissions the same way. Rejected referrals earn nothing.
- **Payouts.** Whole AVAILABLE balance (≥ minimum, > 0) to a saved payout account; those commissions become PAID and linked to the payout; staff mark it paid (reference) or reject it (commissions back to AVAILABLE). One open payout at a time; SUSPENDED partners can't request.
- **Back-fill.** The migration created a Referral for every existing `User.invitedById` (REWARDED with the coins actually paid when `inviteRewardedAt` was set, else PENDING under the new rules).
