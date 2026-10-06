# Engagement features — server API contract (Oct 2026)

Implements `docs/specs/2026-10-06-engagement-features-design.md`. REST under `/v1`; errors are `{ error: { code, message, details? } }`; socket acks are `{ ok: true, data }` / `{ ok: false, error }`. "Day" = business day (UTC+5); weeks start Monday 00:00 business time.

## REST — new

| Method / path | Body | Response |
|---|---|---|
| `GET /engagement` | — | `{ vibeHour: { active: boolean, startsAt: ISO\|null, endsAt: ISO\|null }, progress: { level, xp, levelXp, nextLevelXp }, streaksAtRisk: number }` |
| `GET /me/progress` | — | `{ level, xp, levelXp, nextLevelXp, weekXp, badges: [{ id, name, emoji, earned: boolean, progress: number, target: number }] }` (10 badges, fixed order: verified, first_vibes, social_butterfly, great_talker, loved, heartthrob, generous, streak_7, streak_30, night_owl) |
| `GET /me/recap` | — | `{ weekStart: ISO, weekEnd: ISO, gemsEarned, giftsReceived, likesReceived, newFollowers, matches, bestStreak }` (last Mon–Sun) |
| `GET /leaderboards?board=xp\|gems` | — | `{ board, weekStart: ISO, weekEnd: ISO, top: [{ rank, profile: PublicProfile, score }] (≤50), me: { rank: number\|null, score } }`; bad board → 400 |
| `POST /friends/:userId/streak/restore` | — | 200 `{ streak: StreakView, paidCoins }`; 409 `STREAK_NOT_RESTORABLE`; 402 `INSUFFICIENT_COINS`; 403 `NOT_FRIENDS` |
| `POST /moments` | multipart `photo` (jpeg/png/webp, ≤5 MB), `caption?` (≤120) | 201 `MomentDto` (own: with `viewsCount`); 400 no photo; 415 wrong type; 429 `MOMENT_LIMIT` (10 live); 403 `ACCOUNT_BANNED` |
| `GET /moments/feed` | — | `{ mine: MomentDto[], people: [{ author: PublicProfile, moments: MomentDto[], allSeen: boolean }] }` |
| `POST /moments/:id/view` | — | 200 `{ seen: true }` (own: `{ seen: true, viewsCount }`); 404 `MOMENT_NOT_FOUND` |
| `GET /moments/:id/viewers` | — | `[{ profile: PublicProfile, at: ISO }]` newest first (own only; else 404 `MOMENT_NOT_FOUND`) |
| `DELETE /moments/:id` | — | `{ ok: true }` (own only; else 404) |
| `POST /moments/:id/report` | `{ reason: ReportReason, note?: string(≤400), block?: boolean = true }` | `{ id, blocked }` (same as `POST /reports`) |

`MomentDto = { id, mediaUrl, caption, createdAt: ISO, expiresAt: ISO, seen: boolean, viewsCount?: number }`. Feed: authors = people you follow (ACTIVE) ∪ friends, minus blocks either way; authors with unseen moments first, then by newest moment; each author's moments oldest → newest (story order); `mine` oldest → newest.

`StreakView = { count, best, today, atRisk, mineToday, theirsToday, restorable, lostCount, restoreCost }` (restoreCost already 0 for VIP).

## REST — changed

- `GET /me`, `PATCH /me` response gains: `level`, `xp`, `gemGoal: number|null`, `quietHoursStart: number|null`, `quietHoursEnd: number|null`, `tzOffsetMinutes: number` (default 300), `breakReminderMinutes: number|null`.
- `PATCH /me` accepts: `gemGoal` (int 100…10,000,000 or null), `quietHoursStart` / `quietHoursEnd` (int 0…1439 or null; minutes after local midnight in `tzOffsetMinutes`; quiet hours are on only when both are set and differ; may wrap midnight), `tzOffsetMinutes` (int −720…840), `breakReminderMinutes` (30|60|90|120 or null).
- `GET /wallet` (and `wallet:updated`, and `wallet` in POST /wallet/* responses) gains `gemGoal: number|null`, `freeBoosts: number`.
- `POST /wallet/boost` response: `{ until, free: boolean, paidCoins: number, wallet }` (a free boost credit is used before coins).
- `GET /friends` items gain `streak: StreakView` (zeros for pending requests).
- `PublicProfile` (everywhere: match:found partner, friends, followers, leaderboards, moments…) gains `level: number`.
- `GET /users/:id/view` gains `level: number` and `badges: string[]` (earned ids) at every tier.
- `GET /catalog` `economy` gains: `streakRestoreCost` 30, `streakWeeklyCoins` 10, `freeReconnectMinutes` 10, `vibeHourStart` 1260 (minutes after business midnight), `vibeHourMinutes` 60 (0 = off), `vibeHourGemBonusPercent` 0, `xpPerGoodCall` 10, `xpPerLikeReceived` 5, `xpPerGiftReceived` 5, `xpPerCheckIn` 5, `xpPerStreakDay` 2, `maxEngagementPushesPerDay` 3.
- `POST /friends/:userId/request` only accepts an incoming request; otherwise 403 `FRIEND_IN_CALL_ONLY`. New requests are sent only with socket `match:friend` during a call.

## Sockets — client → server

| Event | Payload | Ack data |
|---|---|---|
| `match:game` | `{ action: 'start'\|'next'\|'answer'\|'close', game?: 'wyr'\|'this_or_that'\|'questions' (required for start), choice?: 0\|1 (required when answering a 2-option prompt), round?: number }` | start/next → `{ matchId, game, round, prompt: { text, options?: [a, b] }, by: 'me' }`; answer → `{ matchId, round, mine, theirs, revealed, partnerAnswered }`; close → `{ matchId }`. Errors: `NOT_IN_MATCH`, `RATE_LIMITED` (start/next more than once per 2 s per call), `CONFLICT` (no open game / stale `round`), `VALIDATION_FAILED` (missing game/choice) |
| `match:like` (changed) | — | `{ mutual: boolean }` (was `null`) |
| `match:reconnect` (changed) | — | `{ reconnected: true, paidCoins: number }` |

## Sockets — server → client (new)

- `match:mutual { matchId }` — both liked each other in this call.
- `match:game { matchId, game, round, prompt: { text, options? }, by: 'me'|'partner' }` — to both on start/next.
- `match:game-answer { matchId, round, mine: 0|1|null, theirs: 0|1|null, revealed: boolean, partnerAnswered: boolean }` — to both on each answer; `theirs` is null until both answered. For `questions` (no options) choices are null; `revealed` turns true once both tapped answer.
- `match:game-closed { matchId }`.
- `social:streak { friendId, streak: StreakView }` — counted or restored (each side gets its own view).
- `engagement:vibe-hour { active, startsAt, endsAt }` — broadcast at start and end of Vibe Hour.
- `moments:new { authorId }` — to online followers/friends of the author.
- `progress:level-up { level }`.
- `wallet:goal-reached { goal }` — gems crossed your goal (once per goal value; offline → push).
- `inbox:message` is also used for the weekly recap (`campaignId: null`).

Changed: `match:ended` gains `mutualLike: boolean`, `reconnectCost: number` (coin price), `freeReconnectUntil: ISO|null` (free while now < it; set after a `disconnected` end or a mutual like). `match:gift` (event and ack) gains `bonusGems: number`.

## Errors (new codes)

`STREAK_NOT_RESTORABLE` 409, `MOMENT_LIMIT` 429 (`details.max`), `MOMENT_NOT_FOUND` 404, `FRIEND_IN_CALL_ONLY` 403. Games use existing `RATE_LIMITED` 429.

## Pushes

New category `engagement` (Android channel id `engagement` — the app needs to create it). Engagement pushes: streak at risk (20:00, route `chat` + `friendId`), Vibe Hour start (route `match`), win-back (route `wallet`), weekly recap (Monday 10:00, route `inbox`). Capped at `maxEngagementPushesPerDay` per user per day. Quiet hours hold back `social`, `engagement`, `inbox`; `messages` and `payments` always go. "Goal reached 🎯" (route `wallet`) uses `payments`. The new-follower push says "X followed you back" when you already follow them.

## Behaviour notes

- Streak day counts when both sent a REST chat message/gift that day, or were in a ≥60 s call together. Every 7th day both get `streakWeeklyCoins` (ledger "Streak · N days with <name>").
- XP: good call (≥60 s, both), like received, gift received (call or chat), check-in, streak day; ×2 during Vibe Hour. Level n needs 25·n·(n−1) total XP. `levelXp` = total XP where the current level started; "X XP to next level" = `nextLevelXp − xp`.
- Vibe Hour: filters free for everyone, XP ×2, gift gems + `vibeHourGemBonusPercent`% (separate ledger entry "Vibe Hour bonus · <gift>").
- Matching picks the best of the first 8 compatible people in the queue: 2·shared interests (≤3) + 3·(1 − |Δ vibeScore|) + 4 for the longest waiter after 20 s.
