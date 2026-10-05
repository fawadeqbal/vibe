# Follow + user profiles — design (2026-10-05)

Status: built (2026-10-05) — see "As built" at the end of the plan. Scope: backend, Flutter app, web app.

## Goal
Let a user **follow** people they have met in a match, and open a **profile screen** for any person they are connected to. The profile shows more as the relationship grows (matched → following → friends). Works the same in the app and on the web.

## Decisions
| Topic | Decision |
|---|---|
| Follow vs friend | Side by side. Follow is one-way, free, no approval (unless private). Friend stays mutual, paid after the free daily ones, and is the only thing that unlocks chat + chat gifts. |
| Followers can message? | **No.** Messaging still requires an accepted `Friendship`. |
| Who can be followed | Only someone you have **met in a match** (same check as friend requests, `NEVER_MATCHED`). No search, no share links. |
| Profile content | Existing public fields + follower/following counts + stats (matches, likes, gifts received). No photo gallery. |
| Visibility | Tiered (below). |
| User controls | Remove a follower, Hide my stats, New-follower notifications, Private account (follow requests). |
| Storage | New `Follow` table + denormalised counters on `User` (approach A). |

## Tiers
| Viewer | Sees |
|---|---|
| `self` | Everything (own profile; the Me screen stays the main entry) |
| `matched` — met in a match, no active follow (incl. pending request) | photo, name, age, country, verified, VIP, bio, interests; Follow + Add friend buttons |
| `following` — active follow | + counts `{followers, following}` + stats `{matches, likes, gifts}` (stats omitted when target `hideStats`) |
| `friends` — accepted Friendship | + `online` + Message button (friends also get counts/stats, no follow needed) |
| none of the above, blocked either way, or target not ACTIVE | `404 User not found` |

Bio and interests stay at the `matched` tier because the live-match partner card already shows them.
Friend tier wins over following: tier = friends ? `friends` : activeFollow ? `following` : met ? `matched` : 404.

## Data model (Prisma)
```prisma
enum FollowStatus { PENDING ACTIVE }

model Follow {
  followerId String
  followeeId String
  status     FollowStatus @default(ACTIVE)
  createdAt  DateTime     @default(now())
  acceptedAt DateTime?

  follower User @relation("FollowsMade", fields: [followerId], references: [id], onDelete: Cascade)
  followee User @relation("FollowsGot",  fields: [followeeId], references: [id], onDelete: Cascade)

  @@id([followerId, followeeId])
  @@index([followeeId, status, createdAt])
  @@index([followerId, status, createdAt])
}

// User additions
followersCount     Int     @default(0)   // ACTIVE follows only
followingCount     Int     @default(0)   // ACTIVE follows only
giftsReceivedCount Int     @default(0)
privateAccount     Boolean @default(false)
hideStats          Boolean @default(false)
```
- Migration backfills `giftsReceivedCount` from `GiftTransfer` (`COUNT(*) GROUP BY toId`). Counters get `CHECK (>= 0)`.
- Hand-check the generated migration (strip the trigram/partial index drops, as usual).

## Backend
New `modules/social/follows.service.ts` + `follows.controller.ts`; profile view in `modules/users`.

### Rules
- `follow(me, target)`: not self; not blocked either way (`BLOCKED`); target ACTIVE; must have a `Match` row with the target (`NEVER_MATCHED`); daily cap `economy.rules.maxFollowsPerDay` (default 200, editable in Admin → Economy → "Friends and boosts"; Redis day counter, `FOLLOW_LIMIT` 429). Idempotent: an existing row returns its state.
  - Target `privateAccount` → row `PENDING`, emit `follow:request`. Else → `ACTIVE`, increment both counters in the same transaction, emit `follow:new`.
- `unfollow(me, target)`: delete row; if it was ACTIVE decrement both counters (guarded UPDATE in the same tx). Emits `follow:removed` to target (silent; no push).
- `accept(me, follower)` / `decline(me, follower)`: only on PENDING rows where `followeeId = me`. Accept → ACTIVE + counters + `follow:accepted` to follower.
- `removeFollower(me, follower)`: same as their unfollow, initiated by followee; no notification to the removed person except list refresh.
- Switching `privateAccount` true → false: accept all PENDING rows in one transaction (counters += n), emit `follow:accepted` to each.
- `USER_BLOCKED` listener: delete follows in both directions, fix counters.
- Account deletion / ban: rows cascade on delete; for soft-deleted/banned users the profile view 404s and lists filter `status = ACTIVE` users. Counters may include inactive users — acceptable (same as likes).
- `wallet.service` gift creation also increments `toUser.giftsReceivedCount` in the same tx.

### API
| Method | Path | Result |
|---|---|---|
| GET | `/users/:id/view` | `ProfileView` (tiered). Old `GET /users/:id` unchanged for installed clients. |
| POST | `/follows/:userId` | `{ state: 'following' \| 'requested' }` |
| DELETE | `/follows/:userId` | unfollow or cancel request |
| GET | `/me/followers?cursor` | own list only: `{ items: {profile, followsBack, since}[], next }` |
| GET | `/me/following?cursor` | own list only |
| GET | `/me/follow-requests?cursor` | own pending incoming |
| POST | `/me/follow-requests/:userId/accept` · `/decline` | |
| DELETE | `/me/followers/:userId` | remove follower |
| PATCH | `/me` | + `privateAccount`, `hideStats` |

`MeProfile` gains `followers`, `following`, `privateAccount`, `hideStats`, `pendingFollowRequests`.

```ts
interface ProfileView {
  profile: PublicProfile;
  tier: 'self' | 'matched' | 'following' | 'friends';
  rel: { follow: 'none' | 'requested' | 'following'; followsYou: boolean; friend: 'none' | 'requested' | 'incoming' | 'friends' };
  counts?: { followers: number; following: number };      // tier following|friends|self
  stats?: { matches: number; likes: number; gifts: number } | 'hidden'; // same tiers; 'hidden' when hideStats (self always sees)
  online?: boolean;                                        // tier friends
}
```
Other people's follower/following **lists are never exposed** (counts only) to prevent scraping.

### Realtime + push
New `ServerEvent`s: `FollowNew 'social:follow-new'`, `FollowRequest 'social:follow-request'`, `FollowAccepted 'social:follow-accepted'`, `FollowRemoved 'social:follow-removed'`.
`PushBridge` builders (category `social`, only when offline — existing behaviour):
- FollowNew → "{name} started following you", data `{route:'profile', userId}`.
- FollowRequest → "{name} wants to follow you", data `{route:'follow-requests'}`.
- FollowAccepted → "{name} accepted your follow request", data `{route:'profile', userId}`.
- Dedupe: Redis `push:follow:<follower>:<followee>` SET NX EX 86400 → at most 1 push per pair per day (blocks follow/unfollow spam).

### Errors
Reuse `BLOCKED`, `NEVER_MATCHED`, `NOT_FOUND`; add `FOLLOW_LIMIT` (HTTP 429) for the daily cap.

## App (Flutter)
- `models/profile_view.dart`, `FollowsProvider` (abstract + Local mock + Remote, picked in `main.dart` like the others).
- `screens/profile/user_profile_screen.dart` — header (photo, name + badges, age · flag), button row (Follow/Requested/Following ✓ + Add friend/Message, "Follows you" chip), counts row, stats card (blurred "Follow to see stats" at matched tier; "Stats hidden"), bio, interests, ⋯ menu (Remove follower · Unfriend · Block · Report).
- Same widget shown as a **bottom sheet over a live call** (tap partner name/avatar in `match_screen.dart`) so the call continues. Small Follow button beside Add friend in the call controls.
- Entry points: match ended, Recent matches rows (Profile), chat header, follower/following lists, push route `profile`.
- Me (`profile_screen.dart`): tappable "Followers · Following" row → `follow_lists_screen.dart` (tabs Followers / Following / Requests — Requests only when private). Switches: Private account, Hide my stats.
- Realtime: handle the four events (refresh counts, toast "X started following you" with Follow back).

## Web (Next.js)
- Route `app/(app)/u/[id]/page.tsx` → `features/profile/user-profile-screen.tsx`; same layout/tokens as app.
- `stores/follows.ts` (zustand, like `stores/social.ts`), `lib/models` types.
- In-call: `connected.tsx` partner name opens the profile as a sheet; `FollowControl` next to `FriendControl`.
- Me: counts row → `/me/follows?tab=followers|following|requests`; switches in edit profile / settings.
- Entry points mirror the app.

## Testing
- Backend unit: tier resolver (all tier/flag combos), follow rules.
- Backend e2e `follows.e2e-spec.ts`: follow/unfollow counters; never-matched (profile view 404, follow 403 `NEVER_MATCHED`); blocked; private → request → accept/decline; private→public auto-accept; remove follower; block clears both directions; daily cap; hideStats; gifts counter; push dedupe.
- App: widget tests per tier + golden screenshots (matched / following / friends / self, light+dark); provider tests with Local mock.
- Web: Playwright — follow from match-ended screen, open profile, see stats unlock.
- Admin: unaffected (verify build still passes).

## Out of scope
Search/discover, public share links, photo gallery, follower counts in the admin panel, feeds/posts, "online now" alerts for followers.

## Changes made while planning (see docs/superpowers/plans/2026-10-05-follow-and-profiles.md)
1. `Follow` has a cuid `id` + `@@unique([followerId, followeeId])` (so the existing cursor pagination works).
2. `MeProfile` gets `followers`, `following`, `privateAccount`, `hideStats` — not `pendingFollowRequests` (the Requests tab reads its own list).
3. App tests are widget/provider tests rather than goldens (dark-only app; golden harness needs a local image cache).
4. Web has Vitest only, so web gets mapper tests + a manual two-browser check instead of Playwright.
5. In a call, Follow is a pill in the top bar (the bottom row already has 5 controls).
6. Private → public goes through `PATCH /me`; `UsersService` awaits a `user.privacy-opened` event that `FollowsService` handles.
