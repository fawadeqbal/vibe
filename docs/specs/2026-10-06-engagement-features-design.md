# Engagement features — design (Oct 2026)

Goal: more reasons to come back daily and longer, better calls — without dark patterns (no paid randomness, no fake counts, capped pushes, user controls for breaks and quiet hours).

Applies to: backend (`apps/vibe/backend`), Flutter app (`apps/vibe/app`), web (`apps/vibe/web`). Admin panel only gets the new economy rules (rendered from `RULE_GROUPS` metadata) plus a `clock` rule kind.

Related rule already shipped: **friend requests are call-only** — `POST /friends/:id/request` only accepts an incoming request, otherwise `403 FRIEND_IN_CALL_ONLY`; new requests go through socket `match:friend`. Profiles show no "Add friend" button.

All "days" are business days (`BUSINESS_TZ_OFFSET_MINUTES`, Pakistan = UTC+5), the same day boundary as the check-in streak. A "day index" = `floor((epochMs + offset) / 86_400_000)`. Weeks start Monday 00:00 business time.

---

## 0. New economy rules — group `engagement` ("Streaks, levels and Vibe Hour")

Added to `EconomyRules`, `RULE_GROUPS`, `DEFAULT_RULES` (admin edits them on Economy page; app/web read them from `/catalog`).

| key | default | kind | meaning |
|---|---|---|---|
| `streakRestoreCost` | 30 | coins | Restore a friend streak that broke yesterday (VIP free) |
| `streakWeeklyCoins` | 10 | coins | Both friends get this every 7th streak day |
| `freeReconnectMinutes` | 10 | minutes (0–120) | Reconnect is free this long after a dropped call or a mutual like |
| `vibeHourStart` | 1260 (21:00) | **clock** (0–1439, minutes after business midnight) | Daily Vibe Hour start |
| `vibeHourMinutes` | 60 | minutes (0–600; 0 = off) | Vibe Hour length |
| `vibeHourGemBonusPercent` | 0 | count (0–200) | Extra gems on gifts during Vibe Hour (paid by the house) |
| `xpPerGoodCall` | 10 | count | Call that lasted ≥ 60 s (once per match per person) |
| `xpPerLikeReceived` | 5 | count | |
| `xpPerGiftReceived` | 5 | count | |
| `xpPerCheckIn` | 5 | count | |
| `xpPerStreakDay` | 2 | count | Each friend, each counted streak day |
| `maxEngagementPushesPerDay` | 3 | count (0–20) | Cap for streak/vibe-hour/win-back/recap pushes |

New `RuleKind` `'clock'`: integer minutes 0–1439, the admin shows/edits it as `HH:MM` (admin `features/economy/format.ts` + rules editor). During Vibe Hour XP is doubled and match filters are free.

---

## 1. Friend streaks 🔥

A day counts when **both** friends sent each other at least one chat message or chat gift that business day (REST `/friends/:id/messages` or `/gifts`), or were in a call together (match `MATCH_ENDED` with duration ≥ 60 s — counts both sides).

DB: columns on `Friendship`: `streakCount Int @default(0)`, `streakBest Int @default(0)`, `streakDay Int?` (last counted day index), `streakLowDay Int?`, `streakHighDay Int?` (last day the low/high user was active).

Logic (`social/streaks.ts` pure + `StreakService`):
- activity by user X on day d → set X's day = d. If both sides' day == d and `streakDay != d`: `streakCount = (streakDay == d-1 ? streakCount+1 : 1)`, `streakDay = d`, `streakBest = max`. Every 7th day → both get `streakWeeklyCoins` (ledger reason `Streak · 7 days with <name>`, idempotency `streak:<friendshipId>:<count>`). Both get `xpPerStreakDay`.
- Displayed state is lazy (today = T):
  - `count` = `streakCount` if `streakDay >= T-1`, else 0.
  - `today` = `streakDay == T`.
  - `atRisk` = `streakDay == T-1 && count >= 3` (it ends at midnight unless both talk).
  - `restorable` = `streakDay == T-2 && streakCount >= 3` → `lostCount = streakCount`.
  - `mineToday` / `theirsToday` from the side days.
- `POST /friends/:userId/streak/restore` → if restorable: charge `streakRestoreCost` (VIP: 0) and set `streakDay = T-1` (keeps the count). Errors: `STREAK_NOT_RESTORABLE` 409, insufficient coins as usual.
- `GET /friends` items get `streak: { count, best, today, atRisk, mineToday, theirsToday, restorable, lostCount, restoreCost }` (restoreCost already 0 for VIP).
- Realtime `social:streak` `{ friendId, streak }` to both when it changes (counted, restored).
- Push (scheduler, below): **streak at risk** at 20:00 business time to each side that has not been active today: "🔥 Your 12-day streak with Ali ends at midnight" (route `chat`, friendId). Max one per pair per day.

UI (app + web):
- Chats list: `🔥 12` after the name (grey when not yet counted today, orange when today counted, pulsing/amber + "ends tonight" when atRisk). Restorable: row subtitle "Streak lost · Restore 🔥 12" button → confirm with cost → restore.
- Chat header: same flame chip; tapping shows a small sheet explaining the rule ("Message each other every day to keep it going. Best: 30").
- Friend profile (friends tier): "🔥 12-day streak".

## 2. In-call icebreaker games

Server-held prompt lists in `matching/icebreakers.ts` (≥ 40 each, light and safe, no sexual content):
- `wyr` Would you rather — `{ text, options: [a, b] }`
- `this_or_that` — `{ text: 'This or that?', options: [a, b] }`
- `questions` Deep & fun questions — `{ text }`

Socket (ack like the rest): `match:game { action: 'start' | 'next' | 'answer' | 'close', game?, choice?: 0|1 }`.
Server state in Redis `mgame:<matchId>` (TTL 1 h): `{ game, round, prompt, answers: {userId: choice} }`, avoids repeating prompts in a match.
Server events to both: `match:game { matchId, game, round, prompt, by: 'me' | 'partner' }`, `match:game-answer { matchId, round, mine: 0|1|null, theirs: 0|1|null, revealed: boolean }` (theirs is only sent once both answered = reveal), `match:game-closed { matchId }`. Rate limit 1 `start/next` per 2 s per match. State cleared on match end.

UI: a "Play" (🎲 `casino` icon) button in the live call controls → small sheet with the 3 games → a glass card over the video (bottom third, above the composer) shows the prompt; options as two pills; after both answered, reveal both choices ("You both picked 🍕!" when same); "Next" and ✕. Either person can start/next/close.

## 3. Mutual like → "It's a vibe!"

In `like()`: if the partner already liked in this match → `match:mutual { matchId }` to both. Client: full-width celebration (gradient rings burst + "It's a vibe! You both liked each other") for ~2.5 s with an **Add friend** button (the in-call friend action; hidden if already friends/requested). Match recap shows "You liked each other 💞".

## 4. Free reconnect window

`MATCH_ENDED` payload gains `reconnectCost` (number) and `freeReconnectUntil` (ISO or null). Reconnect is free when called within `freeReconnectMinutes` of the end **and** (the end reason was `disconnected` **or** both liked each other in that match). Otherwise `reconnectCost` (VIP pays the same as today). `reconnect()` computes the same rule server-side (look up the last `Match` between the pair). Recap button reads "Reconnect · Free for 9:41" with a countdown, falling back to the coin price.

## 5. Vibe Hour

`EngagementService.vibeHour(now)` → `{ active, startsAt, endsAt }` (current window if active, otherwise the next one). Off when `vibeHourMinutes == 0`.
- `GET /engagement` (see §11) includes it; realtime `engagement:vibe-hour { active, startsAt, endsAt }` broadcast to everyone (`realtime.toAll`) at start and end (1-minute interval job under Redis lock, keyed by day so it fires once).
- Effects while active: `filterCost` → 0 for everyone; XP ×2; gift gems × (1 + bonus%).
- Push at start to users active in the last 3 days who are offline: "Vibe Hour is live 🔥 Free filters for the next 60 min" (counts toward the engagement push cap, once per day).
- UI: lobby banner/pill "Vibe Hour · free filters · 42:10 left" (gradient), and before it starts (within 2 h): "Vibe Hour starts at 9:00 PM". Filter chips show "Free" during it. Store earn rows unaffected.

## 6. Moments (24-hour photos)

DB: `Moment { id, userId, mediaKey, mediaUrl, caption VarChar(120) default "", createdAt, expiresAt, viewsCount Int @default(0), deletedAt? }` index (userId, expiresAt); `MomentView { momentId, viewerId, createdAt, @@id([momentId, viewerId]) }`.
- `POST /moments` multipart `photo` (same image pipeline/limits as avatar upload) + `caption` → 201 moment. Max 10 active per user (`MOMENT_LIMIT` 429). Banned users can't post.
- `GET /moments/feed` → `{ mine: Moment[], people: [{ author: PublicProfile, moments: MomentDto[], allSeen }] }` — authors = people I follow (ACTIVE) ∪ friends, not blocked either way, only unexpired; ordered: unseen first, then newest. `MomentDto { id, mediaUrl, caption, createdAt, expiresAt, seen, viewsCount? (own only) }`.
- `POST /moments/:id/view` (idempotent; increments `viewsCount` once per viewer; only if the viewer may see it).
- `GET /moments/:id/viewers` (own only) → `[{ profile, at }]`.
- `DELETE /moments/:id` (own). `POST /moments/:id/report { reason, note? }` → moderation report against the author (note prefixed `Moment <id>`).
- Realtime `moments:new { authorId }` to the author's active followers + friends who are online (clients refresh the feed). No push.
- Hourly cleanup job deletes expired rows (and media, best effort) under a Redis lock.
- Admin: user detail shows nothing new (follow-up).

UI: a **Moments bar** at the top of the Chats tab (horizontal avatars, gradient ring when unseen, grey when seen; first item "Your moment" with + to add). Add: pick photo (app: existing image picking/camera service if any, else `image_picker` is not installed — use the same approach the avatar upload uses; web: file input `accept="image/*"`) → caption → Post. Viewer: full screen, progress bars per moment, auto-advance 5 s, tap left/right, hold to pause, caption, author name/time ago; own: eye icon with view count → viewers sheet, delete; others: report via ⋯.

## 7. Friends online in the lobby

Client only, from the friends list presence (`online` + `social:presence`). Lobby shows a compact row "3 friends online" with up to 5 avatars (green dot); tap → that friend's chat. Hidden when 0 or while searching/in a call.

## 8. Levels, XP and badges

DB on `User`: `xp Int @default(0)`, `goodCallsCount Int @default(0)`, `nightCallsCount Int @default(0)`, `giftsSentCount Int @default(0)`, `bestStreak Int @default(0)`.
- Level from XP (pure `users/levels.ts`): XP needed to reach level n = `25 * n * (n - 1)` (L1 = 0, L2 = 50, L3 = 150, L4 = 300, …). `levelOf(xp)`, `levelProgress(xp) → { level, xp, levelXp, nextLevelXp }`.
- XP sources (`ProgressService.award(userId, amount, reason)` — single place; doubles in Vibe Hour; adds to weekly leaderboard): good call (≥ 60 s, both, at match end; also increments `goodCallsCount`, and `nightCallsCount` when the call started 00:00–04:00 business time), like received, gift received (match or chat), daily check-in, streak day.
- On level change → realtime `progress:level-up { level }`.
- `PublicProfile` gains `level` (number). Everywhere a profile is shown in a call, show a small "Lv 7" chip.
- Badges (computed, `users/badges.ts`; ids stable):
  - `verified` Verified ✔ — verified
  - `first_vibes` First vibes 👋 — 10 matches
  - `social_butterfly` Social butterfly 🦋 — 100 matches
  - `great_talker` Great talker 🎙️ — 50 calls ≥ 1 min
  - `loved` Loved 💖 — 50 likes received
  - `heartthrob` Heartthrob 💘 — 500 likes received
  - `generous` Generous 🎁 — 20 gifts sent
  - `streak_7` On fire 🔥 — 7-day streak (best)
  - `streak_30` Unstoppable ☄️ — 30-day streak
  - `night_owl` Night owl 🦉 — 20 calls after midnight
- `GET /me/progress` → `{ level, xp, levelXp, nextLevelXp, weekXp, badges: [{ id, earned, progress, target }] }`.
- `GET /users/:id/view` (profile view) gains `level` and `badges: string[]` (earned ids only) at every visible tier.

UI: Me screen gets a **Progress** card (level ring/bar "Level 7 · 120 XP to Level 8", earned badges row, "See all" → badges sheet with progress for locked ones, "This week's top" → leaderboard). Other people's profiles: level chip next to name + earned badges row. Level-up: celebratory toast/sheet "Level 8!".

## 9. Weekly leaderboards

Redis sorted sets `lb:xp:<weekIndex>` and `lb:gems:<weekIndex>` (gems received from gifts, before cash-out), expire after 3 weeks.
- `GET /leaderboards?board=xp|gems` → `{ board, weekStart, weekEnd, top: [{ rank, profile: PublicProfile, score }] (50), me: { rank | null, score } }`. Bots, banned, deleted users skipped at read time (over-fetch then filter).
- UI: Leaderboard screen with two tabs (Top talkers = XP, Most gifted = gems), podium for top 3, list, sticky "You · #128 · 340 XP" row, "Resets Monday". Entry: Me → Progress card, and a trophy icon on the Match lobby header. Rows open the profile (the profile view 404s for never-met people → show a toast "You haven't met yet" and do nothing).

## 10. Gem goal + weekly recap

- `User.gemGoal Int?` via `PATCH /me { gemGoal: number | null }` (100 … 10,000,000). Wallet (`GET /wallet`) gains `gemGoal`. Wallet screen: goal card with progress bar of current gems vs goal and the cash value; "Set a goal" when none. When gems cross the goal (on gift received) → realtime `wallet:goal-reached { goal }` + push "Goal reached 🎯" (once per goal value).
- Weekly recap: Monday 10:00 business time job → for users active last week who received anything: in-app inbox message (`UserMessage`, campaignId null) "Your week on Vibe" with gems earned, gifts, likes, new followers, matches, best streak; plus a push (counts toward the cap). `GET /me/recap` → the same numbers for last week (shown as a card on the Wallet screen on Mondays–Wednesdays).

## 11. Smart pushes, win-back, quiet hours, break reminders

- `EngagementNotifier` (1-minute interval, Redis lock) runs time-based jobs once per day each (Redis day keys): streak-at-risk (20:00), vibe-hour start, weekly recap (Mon 10:00), win-back (12:00).
- Cap: engagement pushes (category `engagement`) per user per day ≤ `maxEngagementPushesPerDay` (Redis counter). Message/payment pushes are not capped.
- Followed back: the existing "New follower" push says "Sana followed you back" when the recipient already follows the sender.
- Win-back: users last seen 7–8 days ago (not bots/banned, `winbackAt` null or > 60 days ago) get 1 free boost credit (`Wallet.freeBoosts Int @default(0)`; `POST /wallet/boost` uses a credit before coins; wallet JSON gains `freeBoosts`) + push "We miss you — a free 30-min boost is waiting". `User.winbackAt` set.
- Quiet hours: `User.quietHoursStart Int?`, `User.quietHoursEnd Int?` (minutes after midnight in the user's own offset), `User.tzOffsetMinutes Int @default(300)` (app/web send their offset with `PATCH /me`). `PushService.sendToUser` skips categories `social`, `engagement`, `inbox` during quiet hours (messages and payments still go). Exposed in `GET /me` and `PATCH /me`.
- Break reminders: `User.breakReminderMinutes Int?` (null = off; allowed 30, 60, 90, 120) in `GET/PATCH /me`. Client-only timer: counts foreground time in the app with an active search/call; at the threshold shows a gentle sheet "You've been vibing for 60 minutes. Time for a break?" with "Keep going" / "Take a break" (ends the call, returns to lobby). Resets after 10 min in background.
- Settings UI (Me → new "Notifications & wellbeing" section): Quiet hours switch + from/to pickers, Break reminder (Off / 30 / 60 / 90 / 120 min).
- `GET /engagement` → `{ vibeHour: {active,startsAt,endsAt}, progress: {level,xp,levelXp,nextLevelXp}, streaksAtRisk: number }` — one call on app start / resume.

## 12. Smarter matching

- `User.vibeScore Float @default(0.5)` — exponential moving average (α = 0.1) updated at match end for each side: 1.0 if the call lasted ≥ 60 s or they got liked, 0.6 if 15–60 s, 0.3 if they were skipped in < 15 s, 0.0 if reported in that match.
- Ticket gains `interests: string[]` and `vibeScore`. `pickPartner(me, candidates)`: among the first 8 compatible candidates in queue order, pick the highest `score = 2·sharedInterests(capped 3) + 3·(1 − |Δ vibeScore|) − waitPenalty`, where the oldest compatible candidate gets +4 if it has waited > 20 s (fairness). Pure + unit tested. Queue order/head starts unchanged.

---

## Events summary (new)

Server → client: `social:streak`, `match:game`, `match:game-answer`, `match:game-closed`, `match:mutual`, `engagement:vibe-hour`, `moments:new`, `progress:level-up`, `wallet:goal-reached`. Client → server: `match:game`. Flutter mirrors event names in its realtime client.

## Errors (new)

`FRIEND_IN_CALL_ONLY` 403, `STREAK_NOT_RESTORABLE` 409, `MOMENT_LIMIT` 429, `MOMENT_NOT_FOUND` 404 (or generic not found), `GAME_RATE_LIMITED` (use RATE_LIMITED).

## Tests

Backend: unit for streak math, levels, badges, vibe hour window, pickPartner scoring, reconnect rule; e2e for streak count/restore, games relay, mutual like, free reconnect, moments CRUD/feed/visibility/expiry, progress/leaderboard, gem goal, quiet hours push skip, win-back, call-only friends. App: widget tests for streak chip, game card, progress card, moments bar; provider tests for local mocks. Web: vitest for pure helpers (streak label, level progress, vibe hour countdown) + build.
