# Follow + User Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let people follow someone they met in a match and open a tiered profile screen (matched → following → friends) in the Flutter app and the web app.

**Architecture:** A new directional `Follow` table with denormalised counters on `User`, served by `FollowsService` and `ProfilesService` in the existing NestJS `social` module. A pure `buildProfileView()` decides what each viewer may see. The app adds a `FollowsProvider` (Local + Remote, like the other providers); the web adds a `useFollows` zustand store. Both render the same profile screen, which also opens as a sheet over a live call.

**Tech Stack:** NestJS 11 + Prisma 6 + Postgres + Redis (backend, Jest unit + e2e), Flutter 3 / Dart 3 with `provider` (app, `flutter test`), Next.js 16 + React 19 + zustand + Tailwind 4 (web, Vitest).

**Spec:** `docs/specs/2026-10-05-follow-and-profiles-design.md`

## Global Constraints

- **Followers can't message.** Chat and chat gifts still need an accepted `Friendship` (`NOT_FRIENDS`).
- You can only follow someone you've **met in a match** (`NEVER_MATCHED`, HTTP 403). Blocked either way → `BLOCKED` 403.
- **Tiers:**
  - Never met, blocked, or the target isn't `ACTIVE` → `404 User not found`.
  - `matched` (including a pending request) shows the public profile only.
  - `following` (ACTIVE follow) adds `counts` + `stats`.
  - `friends` adds `online`.
  - `self` sees everything.
  - `stats` is the string `'hidden'` when the target set `hideStats`, except on `self`.
- **Daily cap:** the economy rule `maxFollowsPerDay`, default **200**, range 1–10 000, error `FOLLOW_LIMIT` (HTTP 429).
- **Push:** at most **1 follow push per pair per day**. It goes on the `social` channel and only while the person is offline (existing `PushBridge` behaviour).
- **Counters:** `followersCount` / `followingCount` count `ACTIVE` follows only. They change in the same DB transaction as the follow row and are never negative (CHECK constraint).
- **Lists:** other people's follower/following lists are **never exposed**. Only `/me/...` lists exist.
- **Code style:** long lines. Don't run Prettier / `dart format` on whole existing files (the repos aren't formatted that way).
- **Prisma migrations:** check them by hand. `migrate dev` wants to drop the raw trigram/partial indexes, so delete those lines.
- **API prefix:** `/v1`. All new routes are behind the global JWT guard (no decorator needed).

## Changes from the spec (decided while planning)

1. `Follow` gets a cuid `id` plus `@@unique([followerId, followeeId])` instead of a composite primary key, so the existing `cursorArgs` / `toPage` pagination works unchanged.
2. `MeProfile` gains `followers`, `following`, `privateAccount` and `hideStats`, but **not** `pendingFollowRequests`. The Requests tab reads `GET /me/follow-requests` directly.
3. App tests are widget and provider tests, not golden screenshots. The app is dark-only, and the golden harness in `test_shots/` needs a local image cache.
4. The web app has Vitest only (no Playwright), so web gets mapper unit tests plus a manual browser check in the final task.
5. During a call, the Follow control is a pill in the **top row**, next to the timer. The bottom control row already holds 5 buttons.
6. Switching private → public goes through `PATCH /me`. `UsersService` awaits a `user.privacy-opened` event, and `FollowsService` handles it by accepting every waiting request, following the existing "modules talk through events" pattern.

## File map

**Backend (`apps/vibe/backend`)**

| File | Change |
|---|---|
| `prisma/schema.prisma` | `FollowStatus`, `Follow`, User counters + privacy flags |
| `prisma/migrations/<ts>_follows/migration.sql` | generated, plus CHECKs and a backfill |
| `src/modules/catalog/economy.ts` (+ `.spec.ts`) | `maxFollowsPerDay` rule |
| `src/modules/wallet/wallet.service.ts` | increment `giftsReceivedCount` |
| `src/common/errors/error-codes.ts` | `FOLLOW_LIMIT` |
| `src/infra/realtime/realtime.events.ts` | 4 follow events |
| `src/modules/social/met.ts` | **new**, `haveMet()` |
| `src/modules/social/follows.service.ts` | **new** |
| `src/modules/social/follows.controller.ts` | **new**, `/follows` + `/me/...` lists |
| `src/modules/social/profile-view.ts` (+ `.spec.ts`) | **new**, pure tier logic |
| `src/modules/social/profiles.service.ts` | **new** |
| `src/modules/social/profiles.controller.ts` | **new**, `GET /users/:id/view` |
| `src/modules/social/social.module.ts`, `friends.service.ts` | wire up, reuse `haveMet` |
| `src/modules/users/profile.rules.ts`, `users.service.ts`, `dto/update-profile.dto.ts`, `user.mapper.ts` | privacy settings + MeProfile fields |
| `src/modules/push/push-bridge.ts` | 3 push builders + daily dedupe |
| `test/follows.e2e-spec.ts` | **new** |

**App (`apps/vibe/app`)**

| File | Change |
|---|---|
| `lib/models/follows.dart` | **new**, view models |
| `lib/core/api/mappers.dart` | parse views, entries, settings; report reason out |
| `lib/core/api/realtime_client.dart` | 4 `Ev` names |
| `lib/providers/follows_provider.dart` + `_local.dart` + `_remote.dart` | **new** |
| `lib/main.dart`, `lib/app.dart` | create, provide, load, clear on sign-out |
| `lib/screens/profile/user_profile_screen.dart` | **new**, page + sheet + body |
| `lib/screens/profile/follow_lists_screen.dart` | **new** |
| `lib/screens/profile/profile_screen.dart` | Followers section, privacy switches, tappable recent matches |
| `lib/screens/match/match_screen.dart` | tap partner → sheet; Follow pill |
| `lib/screens/social/chat_screen.dart` | tap header → profile |
| `lib/services/push/push_route.dart`, `lib/screens/home/home_shell.dart` | push routes `profile` / `follow-requests`; in-app toasts |
| `test/follows_test.dart`, `test/user_profile_test.dart` | **new** |

**Web (`apps/vibe/web`)**

| File | Change |
|---|---|
| `src/lib/models.ts`, `src/lib/api/mappers.ts`, `src/lib/api/realtime.ts` | types, mappers, events |
| `src/stores/follows.ts` | **new** |
| `src/stores/runtime.ts` | load + reset |
| `src/features/profile/user-profile.tsx` | **new**, body + screen + sheet + follow pill |
| `src/app/(app)/u/[id]/page.tsx` | **new** |
| `src/features/profile/follow-lists-screen.tsx`, `src/app/(app)/me/follows/page.tsx` | **new** |
| `src/features/profile/me-screen.tsx`, `src/features/match/connected.tsx`, `src/features/match/ended.tsx`, `src/features/chats/chat-view.tsx` | entry points |
| `src/lib/__tests__/follows.test.ts` | **new** |

---

# Part A — Backend

Run everything from `apps/vibe/backend`. You need Postgres + Redis running (`infra/` docker compose or local), `.env` for the dev DB, and the test DB `vibe_test` from `test/setup-env.ts`.

### Task 1: Schema, migration, follow-cap rule, gifts counter

**Files:**
- Modify: `prisma/schema.prisma` (model `User` ~line 39; add after `model Block` ~line 595)
- Create: `prisma/migrations/<timestamp>_follows/migration.sql` (generated, then edited)
- Modify: `src/modules/catalog/economy.ts` (interface ~line 22, group `social` ~line 92, `DEFAULT_RULES` ~line 157)
- Modify: `src/modules/catalog/economy.spec.ts`
- Modify: `src/modules/wallet/wallet.service.ts` (`sendGift`, ~line 82)
- Create: `test/follows.e2e-spec.ts`

**Interfaces:**
- Produces: Prisma model `Follow { id, followerId, followeeId, status: FollowStatus, createdAt, acceptedAt }`, unique input `followerId_followeeId`, relations `User.followsMade` / `User.followsGot`, `Follow.follower` / `Follow.followee`. User columns `followersCount`, `followingCount`, `giftsReceivedCount`, `privateAccount`, `hideStats`. Rule `EconomyRules.maxFollowsPerDay: number`.

- [ ] **Step 1: Write the failing unit test for the rule**

Append inside the top-level `describe` in `src/modules/catalog/economy.spec.ts`:

```ts
  it('follows have a daily cap staff can change', () => {
    expect(DEFAULT_RULES.maxFollowsPerDay).toBe(200);
    expect(RULE_FIELDS.find((f) => f.key === 'maxFollowsPerDay')).toMatchObject({ kind: 'count', min: 1, max: 10_000 });
    expect(RulesPatchSchema.safeParse({ maxFollowsPerDay: 0 }).success).toBe(false);
    expect(RulesPatchSchema.safeParse({ maxFollowsPerDay: 50 }).success).toBe(true);
  });
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx jest src/modules/catalog/economy.spec.ts -t "daily cap"`
Expected: FAIL. TypeScript reports `Property 'maxFollowsPerDay' does not exist on type 'EconomyRules'`.

- [ ] **Step 3: Add the rule**

In `src/modules/catalog/economy.ts`:

In `interface EconomyRules`, after `freeFriendRequestsPerDay: number;` add:
```ts
  maxFollowsPerDay: number;
```

Replace the `social` group:
```ts
  {
    key: 'social',
    label: 'Friends, follows and boosts',
    description: 'Friend requests after the free ones, the daily follow limit, and paid priority in the queue.',
    fields: [
      coins('friendRequestCost', 'Friend request (after the free ones)'),
      count('freeFriendRequestsPerDay', 'Free friend requests per day', 0, 100),
      count('maxFollowsPerDay', 'Follows per day', 1, 10_000, 'Stops spam-following. Unfollowing does not give follows back.'),
      coins('boostCost', 'Boost'),
      { key: 'boostMinutes', label: 'Boost length', kind: 'minutes', min: 1, max: 1440 },
    ],
  },
```

In `DEFAULT_RULES`, after `freeFriendRequestsPerDay: 3,` add:
```ts
  maxFollowsPerDay: 200,
```

(Stored rules are merged over `DEFAULT_RULES` at load (`economy.service.ts` line ~216), so existing servers pick up the default without a data change. The admin Economy page renders from `RULE_GROUPS`, so the new field appears there on its own.)

- [ ] **Step 4: Run the unit tests**

Run: `npx jest src/modules/catalog/economy.spec.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Change the Prisma schema**

In `model User`, after `likesCount       Int        @default(0)` add:
```prisma
  /// ACTIVE follows only; moved in the same transaction as the Follow row.
  followersCount     Int      @default(0)
  followingCount     Int      @default(0)
  giftsReceivedCount Int      @default(0)
  /// Follows need approval.
  privateAccount     Boolean  @default(false)
  /// Matches, likes and gifts are hidden from other people.
  hideStats          Boolean  @default(false)
```
In the relation list of `model User` (after `blocksGot      Block[]               @relation("BlocksGot")`) add:
```prisma
  followsMade    Follow[]              @relation("FollowsMade")
  followsGot     Follow[]              @relation("FollowsGot")
```
After `model Block { … }` add:
```prisma
enum FollowStatus {
  PENDING
  ACTIVE
}

/// One-way follow. Free; a private account approves each request (PENDING).
/// Following never unlocks chat — that stays with Friendship.
model Follow {
  id         String       @id @default(cuid())
  followerId String
  followeeId String
  status     FollowStatus @default(ACTIVE)
  createdAt  DateTime     @default(now())
  acceptedAt DateTime?

  follower User @relation("FollowsMade", fields: [followerId], references: [id], onDelete: Cascade)
  followee User @relation("FollowsGot", fields: [followeeId], references: [id], onDelete: Cascade)

  @@unique([followerId, followeeId])
  @@index([followeeId, status, createdAt])
  @@index([followerId, status, createdAt])
}
```

- [ ] **Step 6: Generate the migration, then edit it**

Run: `npx prisma migrate dev --create-only --name follows`

Open the new `prisma/migrations/<timestamp>_follows/migration.sql`:
1. Delete every `DROP INDEX` line (the trigram/partial indexes Prisma doesn't know about).
2. Append:
```sql
-- Hand-written: integrity and backfill.
ALTER TABLE "Follow" ADD CONSTRAINT "follow_distinct_users" CHECK ("followerId" <> "followeeId");
ALTER TABLE "User" ADD CONSTRAINT "user_social_counts_non_negative" CHECK ("followersCount" >= 0 AND "followingCount" >= 0 AND "giftsReceivedCount" >= 0);
UPDATE "User" u SET "giftsReceivedCount" = g.n
  FROM (SELECT "toId", COUNT(*)::int AS n FROM "GiftTransfer" GROUP BY "toId") g
 WHERE g."toId" = u."id";
```
Then apply it to the dev DB and the test DB, and regenerate the client:
```bash
npx prisma migrate dev
DATABASE_URL="postgresql://vibe:vibe@127.0.0.1:5432/vibe_test?schema=public" npx prisma migrate deploy
npx prisma generate
```
Expected: "All migrations have been successfully applied" (twice) and "Generated Prisma Client".

- [ ] **Step 7: Write the failing e2e test for the gifts counter**

Create `test/follows.e2e-spec.ts`:
```ts
import { createTestApp, resetState, signUp, TestApp, TestUser } from './helpers';

describe('follows and profiles', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t);
  });
  afterAll(() => t.close());

  const met = (a: TestUser, b: TestUser) => t.prisma.match.create({ data: { userAId: a.id, userBId: b.id, endedAt: new Date() } });
  const counts = (u: TestUser) => t.prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { followersCount: true, followingCount: true, giftsReceivedCount: true } });
  const befriend = async (a: TestUser, b: TestUser) => {
    await t.http.post(`/v1/friends/${b.id}/request`).set(a.auth).expect(200);
    await t.http.post(`/v1/friends/${a.id}/accept`).set(b.auth).expect(200);
  };

  it('gifts received are counted', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    await met(a, b);
    await befriend(a, b);
    await t.http.post(`/v1/friends/${b.id}/gifts`).set(a.auth).send({ giftId: 'rose' }).expect(201);
    expect((await counts(b)).giftsReceivedCount).toBe(1);
    expect((await counts(a)).giftsReceivedCount).toBe(0);
  });
});
```

- [ ] **Step 8: Run it and see it fail**

Run: `npx jest --config test/jest-e2e.json --runInBand --forceExit test/follows.e2e-spec.ts`
Expected: FAIL. `expect(received).toBe(expected) Expected: 1 Received: 0`.

- [ ] **Step 9: Count gifts in `WalletService.sendGift`**

In `src/modules/wallet/wallet.service.ts`, replace
```ts
      return tx.giftTransfer.create({ data: { giftId: gift.id, fromId, toId, coins: gift.coins, gems, matchId: ctx.matchId } });
```
with
```ts
      await tx.user.update({ where: { id: toId }, data: { giftsReceivedCount: { increment: 1 } } });
      return tx.giftTransfer.create({ data: { giftId: gift.id, fromId, toId, coins: gift.coins, gems, matchId: ctx.matchId } });
```

- [ ] **Step 10: Run the e2e test and the existing wallet/social suites**

Run: `npx jest --config test/jest-e2e.json --runInBand --forceExit test/follows.e2e-spec.ts test/social.e2e-spec.ts test/wallet.e2e-spec.ts test/economy.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 11: Typecheck + commit**

```bash
npm run typecheck && npm run lint
git add prisma/schema.prisma prisma/migrations src/modules/catalog/economy.ts src/modules/catalog/economy.spec.ts src/modules/wallet/wallet.service.ts test/follows.e2e-spec.ts
git commit -m "feat(social): follow schema, follow cap rule, gifts-received counter"
```

---

### Task 2: FollowsService — follow, unfollow, requests, lists

**Files:**
- Modify: `src/common/errors/error-codes.ts` (social block)
- Modify: `src/infra/realtime/realtime.events.ts`
- Create: `src/modules/social/met.ts`
- Modify: `src/modules/social/friends.service.ts` (`request`, the `match.count` lines)
- Create: `src/modules/social/follows.service.ts`
- Create: `src/modules/social/follows.controller.ts`
- Modify: `src/modules/social/social.module.ts`
- Test: `test/follows.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 1 Prisma models.
- Produces:
  - `haveMet(prisma: PrismaService, a: string, b: string): Promise<boolean>`
  - `type FollowState = 'none' | 'requested' | 'following'`
  - `interface FollowEntry { profile: PublicProfile; since: string; followsBack: boolean }`
  - `FollowsService.state(me, other): Promise<FollowState>`
  - `.follow(me, targetId): Promise<{ state: 'requested' | 'following' }>`
  - `.unfollow(me, targetId): Promise<void>`
  - `.accept(me, followerId)`, `.decline(me, followerId)`, `.removeFollower(me, followerId)`: `Promise<void>`
  - `.list(me, which: 'followers' | 'following' | 'requests', q: CursorQueryDto): Promise<Page<FollowEntry>>`
  - protected-by-convention helpers `activate(tx, followerId, followeeId): Promise<boolean>`, `removeEdge(followerId, followeeId): Promise<boolean>`, `publicProfile(id)`
  - `ServerEvent.FollowNew | FollowRequest | FollowAccepted | FollowRemoved`, with payloads `{ from: PublicProfile }`, `{ from: PublicProfile }`, `{ by: PublicProfile }`, `{ userId: string }`
  - `ErrorCode.FOLLOW_LIMIT`

- [ ] **Step 1: Write the failing e2e tests**

At the top of `test/follows.e2e-spec.ts`, change the import to:
```ts
import { connect, createTestApp, next, resetState, signUp, TestApp, TestUser } from './helpers';
```
Add these tests inside the `describe`:
```ts
  it('you can only follow people you have met, and not yourself', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    const res = await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(403);
    expect(res.body.error.code).toBe('NEVER_MATCHED');
    await t.http.post(`/v1/follows/${a.id}`).set(a.auth).expect(403);
  });

  it('follow → counters, lists, follow back, unfollow; following never opens chat', async () => {
    const a = await signUp(t, { name: 'Priya' });
    const b = await signUp(t, { name: 'Mert' });
    await met(a, b);
    expect((await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(200)).body).toEqual({ state: 'following' });
    expect((await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(200)).body).toEqual({ state: 'following' });
    expect(await counts(a)).toMatchObject({ followingCount: 1, followersCount: 0 });
    expect(await counts(b)).toMatchObject({ followingCount: 0, followersCount: 1 });

    const followers = await t.http.get('/v1/me/followers').set(b.auth).expect(200);
    expect(followers.body).toMatchObject({ items: [{ profile: { id: a.id, name: 'Priya' }, followsBack: false }], nextCursor: null });
    await t.http.post(`/v1/follows/${a.id}`).set(b.auth).expect(200);
    expect((await t.http.get('/v1/me/followers').set(b.auth)).body.items[0].followsBack).toBe(true);
    expect((await t.http.get('/v1/me/following').set(a.auth)).body.items[0]).toMatchObject({ profile: { id: b.id }, followsBack: true });

    await t.http.delete(`/v1/follows/${b.id}`).set(a.auth).expect(200);
    expect(await counts(a)).toMatchObject({ followingCount: 0, followersCount: 1 });
    expect(await counts(b)).toMatchObject({ followingCount: 1, followersCount: 0 });

    const chat = await t.http.post(`/v1/friends/${a.id}/messages`).set(b.auth).send({ text: 'hi' }).expect(403);
    expect(chat.body.error.code).toBe('NOT_FRIENDS');
  });

  it('private accounts approve requests; you can remove a follower', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    const c = await signUp(t);
    await met(a, b);
    await met(c, b);
    await t.prisma.user.update({ where: { id: b.id }, data: { privateAccount: true } });
    expect((await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(200)).body).toEqual({ state: 'requested' });
    await t.http.post(`/v1/follows/${b.id}`).set(c.auth).expect(200);
    expect(await counts(b)).toMatchObject({ followersCount: 0 });
    expect(await counts(a)).toMatchObject({ followingCount: 0 });

    const reqs = await t.http.get('/v1/me/follow-requests').set(b.auth).expect(200);
    expect(reqs.body.items.map((x: { profile: { id: string } }) => x.profile.id).sort()).toEqual([a.id, c.id].sort());
    await t.http.post(`/v1/me/follow-requests/${a.id}/accept`).set(b.auth).expect(200);
    await t.http.post(`/v1/me/follow-requests/${c.id}/decline`).set(b.auth).expect(200);
    await t.http.post(`/v1/me/follow-requests/${c.id}/accept`).set(b.auth).expect(404);
    expect(await counts(b)).toMatchObject({ followersCount: 1 });
    expect(await counts(a)).toMatchObject({ followingCount: 1 });
    expect((await t.http.get('/v1/me/follow-requests').set(b.auth)).body.items).toHaveLength(0);

    await t.http.delete(`/v1/me/followers/${a.id}`).set(b.auth).expect(200);
    expect(await counts(b)).toMatchObject({ followersCount: 0 });
    expect(await counts(a)).toMatchObject({ followingCount: 0 });
  });

  it('a cancelled request leaves no trace', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    await met(a, b);
    await t.prisma.user.update({ where: { id: b.id }, data: { privateAccount: true } });
    await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(200);
    await t.http.delete(`/v1/follows/${b.id}`).set(a.auth).expect(200);
    expect(await t.prisma.follow.count({ where: { followerId: a.id } })).toBe(0);
    expect(await counts(a)).toMatchObject({ followingCount: 0 });
  });

  it('the other person hears about it live', async () => {
    const a = await signUp(t, { name: 'Ali' });
    const b = await signUp(t);
    await met(a, b);
    const s = await connect(t, b);
    try {
      const got = next(s, 'social:follow-new');
      await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(200);
      expect((await got).from).toMatchObject({ id: a.id, name: 'Ali' });
    } finally {
      s.disconnect();
    }
  });
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx jest --config test/jest-e2e.json --runInBand --forceExit test/follows.e2e-spec.ts`
Expected: FAIL. The new tests get `404` from `POST /v1/follows/...` (route not found).

- [ ] **Step 3: Error code and events**

`src/common/errors/error-codes.ts`, in the `// social` block, after `NEVER_MATCHED = 'NEVER_MATCHED',` add:
```ts
  /** Too many new follows today (economy rule maxFollowsPerDay). */
  FOLLOW_LIMIT = 'FOLLOW_LIMIT',
```
`src/infra/realtime/realtime.events.ts`, after `FriendRemoved: 'social:friend-removed',` add:
```ts
  /** Someone followed you: `{ from: PublicProfile }`. */
  FollowNew: 'social:follow-new',
  /** Someone asked to follow your private account: `{ from: PublicProfile }`. */
  FollowRequest: 'social:follow-request',
  /** Your follow request was accepted: `{ by: PublicProfile }`. */
  FollowAccepted: 'social:follow-accepted',
  /** A follow between you and `userId` ended (unfollow, removed, declined later). Refresh. */
  FollowRemoved: 'social:follow-removed',
```

- [ ] **Step 4: `haveMet` helper, used by friend requests too**

Create `src/modules/social/met.ts`:
```ts
import { PrismaService } from '../../infra/prisma/prisma.service';

/** True when the two people have been in a match together (either side). */
export async function haveMet(prisma: PrismaService, a: string, b: string): Promise<boolean> {
  return (await prisma.match.count({ where: { OR: [{ userAId: a, userBId: b }, { userAId: b, userBId: a }] } })) > 0;
}
```
In `src/modules/social/friends.service.ts` add `import { haveMet } from './met';` and replace
```ts
    const met = await this.prisma.match.count({ where: { OR: [{ userAId: me, userBId: targetId }, { userAId: targetId, userBId: me }] } });
    if (!met) throw new AppError(ErrorCode.NEVER_MATCHED, 'You can add people you have met in a match', HttpStatus.FORBIDDEN);
```
with
```ts
    if (!(await haveMet(this.prisma, me, targetId))) throw new AppError(ErrorCode.NEVER_MATCHED, 'You can add people you have met in a match', HttpStatus.FORBIDDEN);
```

- [ ] **Step 5: The service**

Create `src/modules/social/follows.service.ts`:
```ts
import { HttpStatus, Injectable } from '@nestjs/common';
import { FollowStatus, Prisma, UserStatus } from '@prisma/client';

import { cursorArgs, CursorQueryDto, Page, toPage } from '../../common/dto/pagination.dto';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock } from '../../common/utils/clock';
import { PrismaService, Tx } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { PROFILE_INCLUDE, PublicProfile, toPublicProfile } from '../users/user.mapper';
import { BlocksService } from './blocks.service';
import { haveMet } from './met';

export type FollowState = 'none' | 'requested' | 'following';
export type FollowList = 'followers' | 'following' | 'requests';

export interface FollowEntry {
  profile: PublicProfile;
  /** When the follow (or the request) was made. */
  since: string;
  /** Followers: you follow them too. Following: they follow you. Requests: always false. */
  followsBack: boolean;
}

const pair = (followerId: string, followeeId: string) => ({ followerId_followeeId: { followerId, followeeId } });

/**
 * One-way follows. Free; a private account approves each request. The
 * counters on User only count ACTIVE follows and move in the same
 * transaction as the row. Following never unlocks chat (Friendship does).
 */
@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
    private readonly realtime: RealtimeService,
    private readonly clock: Clock,
  ) {}

  async state(me: string, other: string): Promise<FollowState> {
    const f = await this.prisma.follow.findUnique({ where: pair(me, other), select: { status: true } });
    if (!f) return 'none';
    return f.status === FollowStatus.ACTIVE ? 'following' : 'requested';
  }

  async follow(me: string, targetId: string): Promise<{ state: Exclude<FollowState, 'none'> }> {
    if (me === targetId) throw AppError.forbidden("That's you");
    if (await this.blocks.eitherBlocked(me, targetId)) throw new AppError(ErrorCode.BLOCKED, 'Not available', HttpStatus.FORBIDDEN);
    const existing = await this.state(me, targetId);
    if (existing !== 'none') return { state: existing };
    const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { status: true, privateAccount: true } });
    if (!target || target.status !== UserStatus.ACTIVE) throw AppError.notFound('User');
    if (!(await haveMet(this.prisma, me, targetId))) throw new AppError(ErrorCode.NEVER_MATCHED, 'You can follow people you have met in a match', HttpStatus.FORBIDDEN);
    const active = !target.privateAccount;
    try {
      await this.prisma.tx(async (tx) => {
        await tx.follow.create({ data: { followerId: me, followeeId: targetId, status: active ? FollowStatus.ACTIVE : FollowStatus.PENDING, acceptedAt: active ? this.clock.now() : null } });
        if (active) await this.bump(tx, me, targetId, 1);
      });
    } catch (e) {
      // Two taps at once: the other request created the row first.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { state: (await this.state(me, targetId)) as Exclude<FollowState, 'none'> };
      throw e;
    }
    this.realtime.toUser(targetId, active ? ServerEvent.FollowNew : ServerEvent.FollowRequest, { from: await this.publicProfile(me) });
    return { state: active ? 'following' : 'requested' };
  }

  /** Unfollow, or take back a pending request. */
  async unfollow(me: string, targetId: string): Promise<void> {
    if (await this.removeEdge(me, targetId)) this.realtime.toUser(targetId, ServerEvent.FollowRemoved, { userId: me });
  }

  async accept(me: string, followerId: string): Promise<void> {
    const ok = await this.prisma.tx((tx) => this.activate(tx, followerId, me));
    if (!ok) throw AppError.notFound('Follow request');
    this.realtime.toUser(followerId, ServerEvent.FollowAccepted, { by: await this.publicProfile(me) });
  }

  async decline(me: string, followerId: string): Promise<void> {
    await this.prisma.follow.deleteMany({ where: { followerId, followeeId: me, status: FollowStatus.PENDING } });
  }

  async removeFollower(me: string, followerId: string): Promise<void> {
    if (await this.removeEdge(followerId, me)) this.realtime.toUser(followerId, ServerEvent.FollowRemoved, { userId: me });
  }

  /** Your own lists only — other people's lists are never exposed. */
  async list(me: string, which: FollowList, q: CursorQueryDto): Promise<Page<FollowEntry>> {
    const iFollow = which === 'following';
    const where: Prisma.FollowWhereInput = iFollow
      ? { followerId: me, status: FollowStatus.ACTIVE, followee: { status: UserStatus.ACTIVE } }
      : { followeeId: me, status: which === 'requests' ? FollowStatus.PENDING : FollowStatus.ACTIVE, follower: { status: UserStatus.ACTIVE } };
    const rows = await this.prisma.follow.findMany({
      where,
      include: { follower: { include: PROFILE_INCLUDE }, followee: { include: PROFILE_INCLUDE } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...cursorArgs(q),
    });
    const otherIds = rows.map((r) => (iFollow ? r.followeeId : r.followerId));
    const back =
      which === 'requests' || !otherIds.length
        ? []
        : await this.prisma.follow.findMany({
            where: iFollow ? { followerId: { in: otherIds }, followeeId: me, status: FollowStatus.ACTIVE } : { followerId: me, followeeId: { in: otherIds }, status: FollowStatus.ACTIVE },
            select: { followerId: true, followeeId: true },
          });
    const backIds = new Set(back.map((b) => (iFollow ? b.followerId : b.followeeId)));
    const now = this.clock.now();
    return toPage(rows, q.limit, (r) => {
      const other = iFollow ? r.followee : r.follower;
      return { profile: toPublicProfile(other, now), since: r.createdAt.toISOString(), followsBack: backIds.has(other.id) };
    });
  }

  // ── helpers (also used by the listeners in later tasks) ────────────────

  /** PENDING → ACTIVE for follower→followee, with counters. False when nothing was pending. */
  async activate(tx: Tx, followerId: string, followeeId: string): Promise<boolean> {
    const { count } = await tx.follow.updateMany({ where: { followerId, followeeId, status: FollowStatus.PENDING }, data: { status: FollowStatus.ACTIVE, acceptedAt: this.clock.now() } });
    if (count) await this.bump(tx, followerId, followeeId, 1);
    return count > 0;
  }

  /** Deletes follower→followee and fixes the counters. True when a row was removed. */
  removeEdge(followerId: string, followeeId: string): Promise<boolean> {
    return this.prisma.tx(async (tx) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const row = await tx.follow.findUnique({ where: pair(followerId, followeeId), select: { id: true, status: true } });
        if (!row) return false;
        // Delete only if the status is still what we read, so counters stay right if it was accepted meanwhile.
        const { count } = await tx.follow.deleteMany({ where: { id: row.id, status: row.status } });
        if (!count) continue;
        if (row.status === FollowStatus.ACTIVE) await this.bump(tx, followerId, followeeId, -1);
        return true;
      }
      return false;
    });
  }

  async publicProfile(id: string): Promise<PublicProfile> {
    return toPublicProfile(await this.prisma.user.findUniqueOrThrow({ where: { id }, include: PROFILE_INCLUDE }), this.clock.now());
  }

  private async bump(tx: Tx, followerId: string, followeeId: string, by: 1 | -1): Promise<void> {
    await tx.user.update({ where: { id: followerId }, data: { followingCount: { increment: by } } });
    await tx.user.update({ where: { id: followeeId }, data: { followersCount: { increment: by } } });
  }
}
```

- [ ] **Step 6: The controllers**

Create `src/modules/social/follows.controller.ts`:
```ts
import { Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OK } from '../../common/dto/ok.dto';
import { CursorQueryDto } from '../../common/dto/pagination.dto';
import { FollowsService } from './follows.service';

@ApiTags('follows')
@ApiBearerAuth()
@Controller('follows')
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Post(':userId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Follow someone you have met in a match (a request if their account is private)' })
  follow(@CurrentUser('id') me: string, @Param('userId') userId: string) {
    return this.follows.follow(me, userId);
  }

  @Delete(':userId')
  @ApiOperation({ summary: 'Unfollow, or take back a follow request' })
  async unfollow(@CurrentUser('id') me: string, @Param('userId') userId: string) {
    await this.follows.unfollow(me, userId);
    return OK;
  }
}

@ApiTags('follows')
@ApiBearerAuth()
@Controller('me')
export class MyFollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Get('followers')
  @ApiOperation({ summary: 'People who follow you, newest first' })
  followers(@CurrentUser('id') me: string, @Query() q: CursorQueryDto) {
    return this.follows.list(me, 'followers', q);
  }

  @Get('following')
  @ApiOperation({ summary: 'People you follow, newest first' })
  following(@CurrentUser('id') me: string, @Query() q: CursorQueryDto) {
    return this.follows.list(me, 'following', q);
  }

  @Get('follow-requests')
  @ApiOperation({ summary: 'People waiting to follow your private account' })
  requests(@CurrentUser('id') me: string, @Query() q: CursorQueryDto) {
    return this.follows.list(me, 'requests', q);
  }

  @Post('follow-requests/:userId/accept')
  @HttpCode(200)
  async accept(@CurrentUser('id') me: string, @Param('userId') userId: string) {
    await this.follows.accept(me, userId);
    return OK;
  }

  @Post('follow-requests/:userId/decline')
  @HttpCode(200)
  async decline(@CurrentUser('id') me: string, @Param('userId') userId: string) {
    await this.follows.decline(me, userId);
    return OK;
  }

  @Delete('followers/:userId')
  @ApiOperation({ summary: 'Remove someone from your followers (without blocking)' })
  async remove(@CurrentUser('id') me: string, @Param('userId') userId: string) {
    await this.follows.removeFollower(me, userId);
    return OK;
  }
}
```

- [ ] **Step 7: Register them**

`src/modules/social/social.module.ts`:
```ts
import { Module } from '@nestjs/common';

import { WalletModule } from '../wallet/wallet.module';
import { BlocksService } from './blocks.service';
import { FollowsController, MyFollowsController } from './follows.controller';
import { FollowsService } from './follows.service';
import { FriendsService } from './friends.service';
import { LikesService } from './likes.service';
import { MessagesService } from './messages.service';
import { BlocksController, FriendsController, LikesController } from './social.controller';

@Module({
  imports: [WalletModule],
  controllers: [FriendsController, BlocksController, LikesController, FollowsController, MyFollowsController],
  providers: [BlocksService, FriendsService, MessagesService, LikesService, FollowsService],
  exports: [BlocksService, FriendsService, MessagesService, FollowsService],
})
export class SocialModule {}
```

- [ ] **Step 8: Run the tests**

Run: `npx jest --config test/jest-e2e.json --runInBand --forceExit test/follows.e2e-spec.ts test/social.e2e-spec.ts`
Expected: PASS (all).

- [ ] **Step 9: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/common/errors/error-codes.ts src/infra/realtime/realtime.events.ts src/modules/social test/follows.e2e-spec.ts
git commit -m "feat(social): follow, unfollow, follow requests and follower lists"
```

---

### Task 3: Privacy settings — private account, hidden stats, MeProfile counts

**Files:**
- Modify: `src/modules/users/profile.rules.ts` (add an event)
- Modify: `src/modules/users/dto/update-profile.dto.ts`
- Modify: `src/modules/users/users.service.ts` (`update`)
- Modify: `src/modules/users/user.mapper.ts` (`MeProfile`, `toMeProfile`)
- Modify: `src/modules/social/follows.service.ts` (listener + `acceptAll`)
- Test: `test/follows.e2e-spec.ts`

**Interfaces:**
- Consumes: `FollowsService.activate`, `publicProfile` (Task 2).
- Produces:
  - `PRIVACY_OPENED = 'user.privacy-opened'` and `interface PrivacyOpenedEvent { userId: string }`, both exported from `profile.rules.ts`.
  - `MeProfile` gains `followers`, `following`, `privateAccount`, `hideStats`.
  - `PATCH /me` accepts `privateAccount?: boolean` and `hideStats?: boolean`.
  - `FollowsService.acceptAll(me): Promise<number>`.

- [ ] **Step 1: Write the failing e2e test**

Add to `test/follows.e2e-spec.ts`:
```ts
  it('settings: private account and hidden stats; going public accepts waiting requests', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    await met(a, b);
    const on = await t.http.patch('/v1/me').set(b.auth).send({ privateAccount: true, hideStats: true }).expect(200);
    expect(on.body).toMatchObject({ privateAccount: true, hideStats: true, followers: 0, following: 0 });
    expect((await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(200)).body.state).toBe('requested');

    const s = await connect(t, a);
    try {
      const accepted = next(s, 'social:follow-accepted');
      const off = await t.http.patch('/v1/me').set(b.auth).send({ privateAccount: false }).expect(200);
      expect(off.body).toMatchObject({ privateAccount: false, hideStats: true, followers: 1 });
      expect((await accepted).by).toMatchObject({ id: b.id });
    } finally {
      s.disconnect();
    }
    expect((await t.http.get('/v1/me').set(a.auth)).body).toMatchObject({ following: 1 });
  });
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx jest --config test/jest-e2e.json --runInBand --forceExit test/follows.e2e-spec.ts -t "settings"`
Expected: FAIL with `400` (`property privateAccount should not exist`, from the whitelist validation pipe).

- [ ] **Step 3: DTO fields**

In `src/modules/users/dto/update-profile.dto.ts`, at the end of the class add:
```ts
  @ApiPropertyOptional({ description: 'New followers need your approval' })
  @IsOptional()
  @IsBoolean()
  privateAccount?: boolean;

  @ApiPropertyOptional({ description: 'Hide matches, likes and gifts on your profile' })
  @IsOptional()
  @IsBoolean()
  hideStats?: boolean;
```

- [ ] **Step 4: The event**

At the end of `src/modules/users/profile.rules.ts` add:
```ts
/** Emitted (awaited) when an account switches from private to public; waiting follow requests get accepted. */
export const PRIVACY_OPENED = 'user.privacy-opened';
export interface PrivacyOpenedEvent {
  userId: string;
}
```

- [ ] **Step 5: `UsersService.update`**

In `src/modules/users/users.service.ts`, change the profile.rules import to:
```ts
import { isProfileComplete, PRIVACY_OPENED, PrivacyOpenedEvent, PROFILE_COMPLETED, ProfileCompletedEvent } from './profile.rules';
```
In `update()`, add to the `data` object after `marketingEmails: dto.marketingEmails,`:
```ts
      privateAccount: dto.privateAccount,
      hideStats: dto.hideStats,
```
Then replace the tail of `update()`:
```ts
    const after = await this.prisma.user.update({ where: { id }, data, include: PROFILE_INCLUDE });
    this.emitIfCompleted(before, after);
    return toMeProfile(after, this.clock.now());
```
with
```ts
    const after = await this.prisma.user.update({ where: { id }, data, include: PROFILE_INCLUDE });
    this.emitIfCompleted(before, after);
    if (before.privateAccount && !after.privateAccount) {
      // Waiting follow requests are accepted before we answer, so the counts below are current.
      await this.events.emitAsync(PRIVACY_OPENED, { userId: id } satisfies PrivacyOpenedEvent);
      return toMeProfile(await this.findActive(id), this.clock.now());
    }
    return toMeProfile(after, this.clock.now());
```

- [ ] **Step 6: MeProfile fields**

In `src/modules/users/user.mapper.ts`, add to `interface MeProfile` after `likes: number;`:
```ts
  followers: number;
  following: number;
  /** Follows need approval. */
  privateAccount: boolean;
  /** Stats are hidden from other people. */
  hideStats: boolean;
```
and in `toMeProfile` after `likes: u.likesCount,`:
```ts
    followers: u.followersCount,
    following: u.followingCount,
    privateAccount: u.privateAccount,
    hideStats: u.hideStats,
```

- [ ] **Step 7: Accept everything on going public**

In `src/modules/social/follows.service.ts` add the imports:
```ts
import { OnEvent } from '@nestjs/event-emitter';
import { PRIVACY_OPENED, PrivacyOpenedEvent } from '../users/profile.rules';
```
Add these methods to the class (above the helpers section):
```ts
  @OnEvent(PRIVACY_OPENED, { async: true, promisify: true })
  async onPrivacyOpened(e: PrivacyOpenedEvent): Promise<void> {
    await this.acceptAll(e.userId);
  }

  /** Accepts every waiting request (the account went public). */
  async acceptAll(me: string): Promise<number> {
    const pending = await this.prisma.follow.findMany({ where: { followeeId: me, status: FollowStatus.PENDING }, select: { followerId: true } });
    if (!pending.length) return 0;
    const accepted = await this.prisma.tx(async (tx) => {
      const ids: string[] = [];
      for (const { followerId } of pending) if (await this.activate(tx, followerId, me)) ids.push(followerId);
      return ids;
    });
    if (accepted.length) this.realtime.toUsers(accepted, ServerEvent.FollowAccepted, { by: await this.publicProfile(me) });
    return accepted.length;
  }
```

- [ ] **Step 8: Run the tests**

Run: `npx jest --config test/jest-e2e.json --runInBand --forceExit test/follows.e2e-spec.ts test/auth.e2e-spec.ts`
Expected: PASS. If `auth.e2e-spec.ts` snapshots the whole `/me` body with `toEqual`, add the four new fields (`followers: 0, following: 0, privateAccount: false, hideStats: false`) to that expectation.

- [ ] **Step 9: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/modules/users src/modules/social/follows.service.ts test
git commit -m "feat(users): private account and hidden stats settings; follower counts on /me"
```

---

### Task 4: Safety — daily follow cap and block cleanup

**Files:**
- Modify: `src/modules/social/follows.service.ts`
- Test: `test/follows.e2e-spec.ts`

**Interfaces:**
- Consumes: `USER_BLOCKED`, `UserBlockedEvent` from `blocks.service.ts`; `EconomyService.rules.maxFollowsPerDay`; `RedisService.incrWithTtl(key, ttlSeconds): Promise<number>`; `Clock.dayOf(): Date`.
- Produces: `follow()` throws `FOLLOW_LIMIT` (429, details `{ max }`); blocking removes follows in both directions.

- [ ] **Step 1: Write the failing e2e tests**

At the top of `test/follows.e2e-spec.ts`, change the import to:
```ts
import { connect, createTestApp, next, resetState, signUp, sleep, staffLogin, TestApp, TestUser } from './helpers';
```
Inside the `describe`, below `befriend`, add:
```ts
  const waitFor = async (check: () => Promise<boolean>, ms = 3000) => {
    const end = Date.now() + ms;
    while (!(await check())) {
      if (Date.now() > end) throw new Error('timed out');
      await sleep(25);
    }
  };
```
Then the tests:
```ts
  it('blocking removes follows both ways and fixes the counts', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    await met(a, b);
    await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(200);
    await t.http.post(`/v1/follows/${a.id}`).set(b.auth).expect(200);
    await t.http.post(`/v1/blocks/${a.id}`).set(b.auth).expect(200);
    await waitFor(async () => (await t.prisma.follow.count({ where: { OR: [{ followerId: a.id }, { followerId: b.id }] } })) === 0);
    expect(await counts(a)).toMatchObject({ followersCount: 0, followingCount: 0 });
    expect(await counts(b)).toMatchObject({ followersCount: 0, followingCount: 0 });
    expect((await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(403)).body.error.code).toBe('BLOCKED');
  });

  it('a daily cap stops spam-following', async () => {
    const owner = await staffLogin(t);
    await t.http.put('/v1/admin/economy/rules').set(owner.auth).send({ value: { maxFollowsPerDay: 2 } }).expect(200);
    try {
      const me = await signUp(t);
      const statuses: number[] = [];
      for (let i = 0; i < 3; i++) {
        const other = await signUp(t);
        await met(me, other);
        const r = await t.http.post(`/v1/follows/${other.id}`).set(me.auth);
        statuses.push(r.status);
        if (r.status === 429) expect(r.body.error).toMatchObject({ code: 'FOLLOW_LIMIT', details: { max: 2 } });
      }
      expect(statuses).toEqual([200, 200, 429]);
    } finally {
      await t.http.put('/v1/admin/economy/rules').set(owner.auth).send({ value: { maxFollowsPerDay: 200 } }).expect(200);
    }
  });
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx jest --config test/jest-e2e.json --runInBand --forceExit test/follows.e2e-spec.ts -t "blocking removes follows|daily cap"`
Expected: FAIL. The block test reports `timed out`; the cap test gets `[200, 200, 200]`.

- [ ] **Step 3: Implement**

In `src/modules/social/follows.service.ts`, add the imports:
```ts
import { RedisService } from '../../infra/redis/redis.service';
import { EconomyService } from '../catalog/economy.service';
import { BlocksService, USER_BLOCKED, UserBlockedEvent } from './blocks.service';
```
(Replace the existing `BlocksService` import line with that one.)

Extend the constructor:
```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
    private readonly realtime: RealtimeService,
    private readonly clock: Clock,
    private readonly redis: RedisService,
    private readonly economy: EconomyService,
  ) {}
```
In `follow()`, directly after the `NEVER_MATCHED` check and before `const active = …`, add:
```ts
    await this.countToday(me);
```
Add the listener and the cap method to the class:
```ts
  @OnEvent(USER_BLOCKED, { async: true })
  async onBlocked(e: UserBlockedEvent): Promise<void> {
    await this.removeEdge(e.blockerId, e.blockedId);
    await this.removeEdge(e.blockedId, e.blockerId);
  }

  /** Spam guard: at most `maxFollowsPerDay` new follows per business day. */
  private async countToday(me: string): Promise<void> {
    const max = this.economy.rules.maxFollowsPerDay;
    const n = await this.redis.incrWithTtl(`follows:day:${me}:${this.clock.dayOf().getTime()}`, 2 * 86_400);
    if (n > max) throw new AppError(ErrorCode.FOLLOW_LIMIT, `You can follow up to ${max} people a day`, HttpStatus.TOO_MANY_REQUESTS, { max });
  }
```

- [ ] **Step 4: Run the whole file**

Run: `npx jest --config test/jest-e2e.json --runInBand --forceExit test/follows.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint
git add src/modules/social/follows.service.ts test/follows.e2e-spec.ts
git commit -m "feat(social): daily follow cap and block cleanup for follows"
```

---

### Task 5: Tiered profile view — `GET /users/:id/view`

**Files:**
- Create: `src/modules/social/profile-view.ts`
- Create: `src/modules/social/profile-view.spec.ts`
- Create: `src/modules/social/profiles.service.ts`
- Create: `src/modules/social/profiles.controller.ts`
- Modify: `src/modules/social/social.module.ts`
- Test: `test/follows.e2e-spec.ts`

**Interfaces:**
- Consumes: `FriendsService.state(me, other): Promise<FriendState | 'none'>`, `FollowsService.state`, `haveMet`, `BlocksService.eitherBlocked`, `RealtimeService.isOnline(id): Promise<boolean>`.
- Produces:
  - `type ProfileTier = 'self' | 'matched' | 'following' | 'friends'`
  - `interface Relationship { follow: FollowState; followsYou: boolean; friend: FriendState | 'none' }`
  - `interface ProfileView { profile: PublicProfile; tier: ProfileTier; rel: Relationship; counts?: { followers: number; following: number }; stats?: { matches: number; likes: number; gifts: number } | 'hidden'; online?: boolean }`
  - `buildProfileView(profile, facts): ProfileView | null`
  - `NO_RELATIONSHIP`
  - `ProfilesService.view(me, id): Promise<ProfileView>`

- [ ] **Step 1: Write the failing unit test**

Create `src/modules/social/profile-view.spec.ts`:
```ts
import type { PublicProfile } from '../users/user.mapper';
import { buildProfileView, NO_RELATIONSHIP, ProfileFacts } from './profile-view';

const profile: PublicProfile = { id: 'u2', name: 'Sana', age: 23, gender: 'female', countryCode: 'PK', avatarUrl: '', bio: 'coffee first', interests: ['Music'], verified: false, vip: false };
const facts = (over: Partial<ProfileFacts> = {}): ProfileFacts => ({
  self: false,
  met: true,
  rel: NO_RELATIONSHIP,
  hideStats: false,
  online: true,
  counts: { followers: 5, following: 2 },
  stats: { matches: 40, likes: 9, gifts: 3 },
  ...over,
});

describe('profile tiers', () => {
  it('people who never met get nothing', () => {
    expect(buildProfileView(profile, facts({ met: false }))).toBeNull();
  });

  it('matched: the public profile and the relationship, nothing more', () => {
    expect(buildProfileView(profile, facts())).toEqual({ profile, tier: 'matched', rel: NO_RELATIONSHIP });
  });

  it('a pending follow request is still the matched tier', () => {
    expect(buildProfileView(profile, facts({ rel: { ...NO_RELATIONSHIP, follow: 'requested' } }))?.tier).toBe('matched');
  });

  it('following: counts and stats, but no presence', () => {
    const v = buildProfileView(profile, facts({ rel: { ...NO_RELATIONSHIP, follow: 'following' } }));
    expect(v).toMatchObject({ tier: 'following', counts: { followers: 5, following: 2 }, stats: { matches: 40, likes: 9, gifts: 3 } });
    expect(v?.online).toBeUndefined();
  });

  it('friends: presence too, even without following', () => {
    expect(buildProfileView(profile, facts({ rel: { ...NO_RELATIONSHIP, friend: 'friends' } }))).toMatchObject({ tier: 'friends', online: true, counts: { followers: 5 } });
  });

  it('hidden stats are hidden from others but not from yourself', () => {
    expect(buildProfileView(profile, facts({ hideStats: true, rel: { ...NO_RELATIONSHIP, follow: 'following' } }))?.stats).toBe('hidden');
    expect(buildProfileView(profile, facts({ hideStats: true, self: true }))).toMatchObject({ tier: 'self', stats: { matches: 40 } });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx jest src/modules/social/profile-view.spec.ts`
Expected: FAIL with `Cannot find module './profile-view'`.

- [ ] **Step 3: The pure tier logic**

Create `src/modules/social/profile-view.ts`:
```ts
import type { PublicProfile } from '../users/user.mapper';
import type { FollowState } from './follows.service';
import type { FriendState } from './friends.service';

export type ProfileTier = 'self' | 'matched' | 'following' | 'friends';

export interface Relationship {
  follow: FollowState;
  followsYou: boolean;
  friend: FriendState | 'none';
}

export interface ProfileCounts {
  followers: number;
  following: number;
}

export interface ProfileStats {
  matches: number;
  likes: number;
  gifts: number;
}

/** Someone's profile as the viewer may see it. Optional parts are left out, not nulled. */
export interface ProfileView {
  profile: PublicProfile;
  tier: ProfileTier;
  rel: Relationship;
  counts?: ProfileCounts;
  stats?: ProfileStats | 'hidden';
  online?: boolean;
}

/** Everything the rules need to decide; gathered by ProfilesService. */
export interface ProfileFacts {
  self: boolean;
  met: boolean;
  rel: Relationship;
  hideStats: boolean;
  online: boolean;
  counts: ProfileCounts;
  stats: ProfileStats;
}

export const NO_RELATIONSHIP: Relationship = { follow: 'none', followsYou: false, friend: 'none' };

/** Friends beat following beats matched. Null = may not see this profile at all. */
export function resolveTier(f: Pick<ProfileFacts, 'self' | 'met' | 'rel'>): ProfileTier | null {
  if (f.self) return 'self';
  if (f.rel.friend === 'friends') return 'friends';
  if (f.rel.follow === 'following') return 'following';
  return f.met ? 'matched' : null;
}

/**
 * The profile opens up as the relationship grows: matched → public profile;
 * following → + counts and stats; friends → + online. Bio and interests are
 * public because the live-match card already shows them.
 */
export function buildProfileView(profile: PublicProfile, f: ProfileFacts): ProfileView | null {
  const tier = resolveTier(f);
  if (!tier) return null;
  const view: ProfileView = { profile, tier, rel: f.rel };
  if (tier === 'matched') return view;
  view.counts = f.counts;
  view.stats = f.hideStats && tier !== 'self' ? 'hidden' : f.stats;
  if (tier === 'friends') view.online = f.online;
  return view;
}
```

- [ ] **Step 4: Run the unit test**

Run: `npx jest src/modules/social/profile-view.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the failing e2e test**

Add to `test/follows.e2e-spec.ts`:
```ts
  it('the profile opens up: matched → following → friends; strangers and blocked get 404', async () => {
    const a = await signUp(t);
    const b = await signUp(t, { name: 'Sana', bio: 'coffee first' });
    const stranger = await signUp(t);
    await met(a, b);
    await t.http.get(`/v1/users/${b.id}/view`).set(stranger.auth).expect(404);

    const matched = (await t.http.get(`/v1/users/${b.id}/view`).set(a.auth).expect(200)).body;
    expect(matched).toMatchObject({ tier: 'matched', profile: { name: 'Sana', bio: 'coffee first' }, rel: { follow: 'none', followsYou: false, friend: 'none' } });
    expect(matched.counts).toBeUndefined();
    expect(matched.stats).toBeUndefined();

    await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(200);
    expect((await t.http.get(`/v1/users/${b.id}/view`).set(a.auth)).body).toMatchObject({ tier: 'following', counts: { followers: 1, following: 0 }, stats: { matches: 0, likes: 0, gifts: 0 } });
    expect((await t.http.get(`/v1/users/${a.id}/view`).set(b.auth)).body.rel).toMatchObject({ followsYou: true });

    await t.http.patch('/v1/me').set(b.auth).send({ hideStats: true }).expect(200);
    expect((await t.http.get(`/v1/users/${b.id}/view`).set(a.auth)).body.stats).toBe('hidden');
    expect((await t.http.get(`/v1/users/${b.id}/view`).set(b.auth)).body).toMatchObject({ tier: 'self', stats: { gifts: 0 } });

    await befriend(a, b);
    expect((await t.http.get(`/v1/users/${b.id}/view`).set(a.auth)).body).toMatchObject({ tier: 'friends', online: false, rel: { friend: 'friends' } });

    await t.http.post(`/v1/blocks/${a.id}`).set(b.auth).expect(200);
    await t.http.get(`/v1/users/${b.id}/view`).set(a.auth).expect(404);
  });
```

- [ ] **Step 6: Run it and see it fail**

Run: `npx jest --config test/jest-e2e.json --runInBand --forceExit test/follows.e2e-spec.ts -t "profile opens up"`
Expected: FAIL. `expected 200 "OK", got 404 "Not Found"` on the first `matched` request (the route doesn't exist yet).

- [ ] **Step 7: Service and controller**

Create `src/modules/social/profiles.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { Clock } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { PROFILE_INCLUDE, toPublicProfile } from '../users/user.mapper';
import { BlocksService } from './blocks.service';
import { FollowsService } from './follows.service';
import { FriendsService } from './friends.service';
import { haveMet } from './met';
import { buildProfileView, NO_RELATIONSHIP, ProfileView, Relationship } from './profile-view';

/** Gathers the facts about you and them, then lets `buildProfileView` decide. */
@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
    private readonly friends: FriendsService,
    private readonly follows: FollowsService,
    private readonly realtime: RealtimeService,
    private readonly clock: Clock,
  ) {}

  async view(me: string, id: string): Promise<ProfileView> {
    const self = me === id;
    if (!self && (await this.blocks.eitherBlocked(me, id))) throw AppError.notFound('User');
    const u = await this.prisma.user.findUnique({ where: { id }, include: PROFILE_INCLUDE });
    if (!u || u.status !== UserStatus.ACTIVE) throw AppError.notFound('User');

    let rel: Relationship = NO_RELATIONSHIP;
    let met = true;
    let online = false;
    if (!self) {
      const [friend, follow, back, m, on] = await Promise.all([this.friends.state(me, id), this.follows.state(me, id), this.follows.state(id, me), haveMet(this.prisma, me, id), this.realtime.isOnline(id)]);
      rel = { friend, follow, followsYou: back === 'following' };
      met = m;
      online = on;
    }

    const view = buildProfileView(toPublicProfile(u, this.clock.now()), {
      self,
      met,
      rel,
      online,
      hideStats: u.hideStats,
      counts: { followers: u.followersCount, following: u.followingCount },
      stats: { matches: u.matchesCount, likes: u.likesCount, gifts: u.giftsReceivedCount },
    });
    if (!view) throw AppError.notFound('User');
    return view;
  }
}
```
Create `src/modules/social/profiles.controller.ts`:
```ts
import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProfilesService } from './profiles.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get(':id/view')
  @ApiOperation({ summary: 'A profile as you may see it: counts and stats once you follow, online once you are friends; 404 if you never met' })
  view(@CurrentUser('id') me: string, @Param('id') id: string) {
    return this.profiles.view(me, id);
  }
}
```
In `src/modules/social/social.module.ts` add `import { ProfilesController } from './profiles.controller';` and `import { ProfilesService } from './profiles.service';`. Then add `ProfilesController` to `controllers` and `ProfilesService` to `providers`.

- [ ] **Step 8: Run unit + e2e**

Run: `npx jest src/modules/social && npx jest --config test/jest-e2e.json --runInBand --forceExit test/follows.e2e-spec.ts test/social.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
npm run typecheck && npm run lint
git add src/modules/social test/follows.e2e-spec.ts
git commit -m "feat(social): tiered profile view GET /users/:id/view"
```

---

### Task 6: Push notifications for follows (one per pair per day)

**Files:**
- Modify: `src/modules/push/push-bridge.ts`
- Test: `test/follows.e2e-spec.ts`

**Interfaces:**
- Consumes: the `ServerEvent.FollowNew/FollowRequest/FollowAccepted` payloads from Task 2; `RedisService.client`.
- Produces: push `data.route` values `'profile'` (with `userId`) and `'follow-requests'`. The app routes these in Task 10.

- [ ] **Step 1: Write the failing e2e test**

At the top of `test/follows.e2e-spec.ts` add:
```ts
import { DevPushSender } from '../src/modules/push/push-sender';
import { PushService } from '../src/modules/push/push.service';
```
Add the test:
```ts
  it('offline people get one follow push per person per day', async () => {
    const a = await signUp(t, { name: 'Priya' });
    const b = await signUp(t);
    await met(a, b);
    const token = 'fcm-token-follow-test-000001';
    await t.http.post('/v1/me/push-tokens').set(b.auth).send({ token, platform: 'android' }).expect(200);
    const sent = () => (t.app.get(PushService).sender as DevPushSender).sent.filter((x) => x.token === token).map((x) => x.msg);
    await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(200);
    await t.http.delete(`/v1/follows/${b.id}`).set(a.auth).expect(200);
    await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(200);
    await sleep(250);
    expect(sent()).toEqual([expect.objectContaining({ title: 'New follower', body: 'Priya started following you', category: 'social', data: { route: 'profile', userId: a.id } })]);
  });
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx jest --config test/jest-e2e.json --runInBand --forceExit test/follows.e2e-spec.ts -t "follow push"`
Expected: FAIL. `sent()` is `[]`.

- [ ] **Step 3: Builders + dedupe**

In `src/modules/push/push-bridge.ts` add the import:
```ts
import { RedisService } from '../../infra/redis/redis.service';
```
Add `private readonly redis: RedisService,` as the last constructor parameter. Add these three entries to `builders` (after `[ServerEvent.FriendAccepted]`):
```ts
    [ServerEvent.FollowNew]: async (p, userId) => {
      const from = (p.from ?? {}) as { id?: string; name?: string };
      if (!(await this.firstToday(`push:follow:${from.id}:${userId}`))) return null;
      return { title: 'New follower', body: `${from.name || 'Someone'} started following you`, data: { route: 'profile', userId: String(from.id ?? '') }, category: 'social' };
    },
    [ServerEvent.FollowRequest]: async (p, userId) => {
      const from = (p.from ?? {}) as { id?: string; name?: string };
      if (!(await this.firstToday(`push:follow-req:${from.id}:${userId}`))) return null;
      return { title: 'Follow request', body: `${from.name || 'Someone'} wants to follow you`, data: { route: 'follow-requests' }, category: 'social' };
    },
    [ServerEvent.FollowAccepted]: (p) => {
      const by = (p.by ?? {}) as { id?: string; name?: string };
      return { title: 'Request accepted', body: `${by.name || 'Someone'} accepted your follow request`, data: { route: 'profile', userId: String(by.id ?? '') }, category: 'social' };
    },
```
Add the helper method to the class:
```ts
  /** True the first time this key is seen today (follow/unfollow spam gets one push a day). */
  private async firstToday(key: string): Promise<boolean> {
    return (await this.redis.client.set(key, '1', 'EX', 86_400, 'NX')) === 'OK';
  }
```

- [ ] **Step 4: Run all backend tests**

```bash
npm test
npm run test:e2e
```
Expected: PASS (unit + all e2e suites, including `extras.e2e-spec.ts` push tests).

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint
git add src/modules/push/push-bridge.ts test/follows.e2e-spec.ts
git commit -m "feat(push): follow notifications, one per person per day"
```

---
# Part B — Flutter app

Run everything from `apps/vibe/app`. Lints: `flutter analyze` must stay at the 2 pre-existing infos.

### Task 7: Models, mappers, realtime names

**Files:**
- Create: `lib/models/follows.dart`
- Modify: `lib/core/api/mappers.dart` (add import + static methods to `ApiMap`)
- Modify: `lib/core/api/realtime_client.dart` (`class Ev`)
- Create: `test/follows_test.dart`

**Interfaces:**
- Produces:
  - Enums `ProfileTier { self, matched, following, friends }`, `FollowState { none, requested, following }`, `FollowList { followers, following, requests }`, `FollowNoticeKind { newFollower, request, accepted }`.
  - Classes `ProfileStats(matches, likes, gifts)`, `ProfileView(profile, tier, follow, followsYou, friend, followers?, following?, stats?, statsHidden, online?)`, `FollowEntry(profile, since, followsBack)`, `FollowPage(items, nextCursor)`, `FollowSettings(followers, following, privateAccount, hideStats).copyWith`, `FollowNotice(kind, profile).text`.
  - `ApiMap.followState(Object?)`, `ApiMap.friendState(Object?)`, `ApiMap.profileView(Map)`, `ApiMap.followEntry(Map)`, `ApiMap.followSettings(Map)`, `ApiMap.reportReasonOut(ReportReason)`.
  - `Ev.followNew`, `Ev.followRequest`, `Ev.followAccepted`, `Ev.followRemoved`.

- [ ] **Step 1: Write the failing tests**

Create `test/follows_test.dart`:
```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/core/api/mappers.dart';
import 'package:vibe_app/models/follows.dart';
import 'package:vibe_app/models/models.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('follow mappers', () {
    test('matched tier: no counts, no stats', () {
      final v = ApiMap.profileView({
        'profile': {'id': 'u2', 'name': 'Sana', 'age': 23, 'countryCode': 'PK'},
        'tier': 'matched',
        'rel': {'follow': 'requested', 'followsYou': true, 'friend': 'none'},
      });
      expect(v.tier, ProfileTier.matched);
      expect(v.follow, FollowState.requested);
      expect(v.followsYou, isTrue);
      expect(v.friend, FriendState.none);
      expect(v.followers, isNull);
      expect(v.stats, isNull);
      expect(v.statsHidden, isFalse);
      expect(v.online, isNull);
    });

    test('following tier with hidden stats', () {
      final v = ApiMap.profileView({
        'profile': {'id': 'u2'},
        'tier': 'following',
        'rel': {'follow': 'following'},
        'counts': {'followers': 12, 'following': 3},
        'stats': 'hidden',
      });
      expect(v.followers, 12);
      expect(v.following, 3);
      expect(v.stats, isNull);
      expect(v.statsHidden, isTrue);
    });

    test('friends tier with stats and presence; unknown values fall back', () {
      final v = ApiMap.profileView({
        'profile': {'id': 'u2'},
        'tier': 'friends',
        'rel': {'friend': 'friends', 'follow': 'bogus'},
        'counts': {'followers': 1, 'following': 1},
        'stats': {'matches': 40, 'likes': 9, 'gifts': 3},
        'online': true,
      });
      expect(v.tier, ProfileTier.friends);
      expect(v.friend, FriendState.friends);
      expect(v.follow, FollowState.none);
      expect(v.stats!.matches, 40);
      expect(v.online, isTrue);
      expect(ApiMap.profileView({'profile': {'id': 'x'}, 'tier': 'admin'}).tier, ProfileTier.matched);
    });

    test('entries, settings, report reasons', () {
      final e = ApiMap.followEntry({'profile': {'id': 'u3', 'name': 'Ali'}, 'since': '2026-10-05T10:00:00Z', 'followsBack': true});
      expect(e.profile.id, 'u3');
      expect(e.followsBack, isTrue);
      final s = ApiMap.followSettings({'followers': 4, 'following': 1, 'privateAccount': true});
      expect([s.followers, s.following, s.privateAccount, s.hideStats], [4, 1, true, false]);
      expect(ApiMap.reportReasonOut(ReportReason.harassment), 'HARASSMENT');
      expect(const FollowNotice(FollowNoticeKind.request, Profile(id: 'a', name: 'Sana', age: 20, gender: Gender.female, country: Country('PK', 'Pakistan', '🇵🇰'), avatarUrl: '')).text, 'Sana wants to follow you');
    });
  });
}
```

- [ ] **Step 2: Run them and see them fail**

Run: `flutter test test/follows_test.dart`
Expected: FAIL to compile. `Target of URI doesn't exist: 'package:vibe_app/models/follows.dart'`.

- [ ] **Step 3: The models**

Create `lib/models/follows.dart`:
```dart
import 'models.dart';

/// How much of someone's profile you may see (the server decides).
enum ProfileTier { self, matched, following, friends }

/// Your follow towards someone.
enum FollowState { none, requested, following }

/// Your own lists (nobody else's are ever shown).
enum FollowList { followers, following, requests }

class ProfileStats {
  const ProfileStats({required this.matches, required this.likes, required this.gifts});
  final int matches;
  final int likes;
  final int gifts;
}

/// Someone's profile as the server lets you see it (GET /users/:id/view).
/// [followers], [following] and [stats] are null below the "following" tier.
class ProfileView {
  const ProfileView({
    required this.profile,
    required this.tier,
    this.follow = FollowState.none,
    this.followsYou = false,
    this.friend = FriendState.none,
    this.followers,
    this.following,
    this.stats,
    this.statsHidden = false,
    this.online,
  });

  final Profile profile;
  final ProfileTier tier;
  final FollowState follow;
  final bool followsYou;
  final FriendState friend;
  final int? followers;
  final int? following;
  final ProfileStats? stats;
  final bool statsHidden;
  final bool? online;
}

/// A row in your followers / following / requests list.
class FollowEntry {
  const FollowEntry({required this.profile, required this.since, this.followsBack = false});
  final Profile profile;
  final DateTime since;
  final bool followsBack;
}

class FollowPage {
  const FollowPage(this.items, this.nextCursor);
  final List<FollowEntry> items;
  final String? nextCursor;
}

/// Your follow numbers and privacy switches (from GET /me).
class FollowSettings {
  const FollowSettings({this.followers = 0, this.following = 0, this.privateAccount = false, this.hideStats = false});
  final int followers;
  final int following;
  final bool privateAccount;
  final bool hideStats;

  FollowSettings copyWith({int? followers, int? following, bool? privateAccount, bool? hideStats}) => FollowSettings(
        followers: followers ?? this.followers,
        following: following ?? this.following,
        privateAccount: privateAccount ?? this.privateAccount,
        hideStats: hideStats ?? this.hideStats,
      );
}

enum FollowNoticeKind { newFollower, request, accepted }

/// Something to tell the user right away ("Sana started following you").
class FollowNotice {
  const FollowNotice(this.kind, this.profile);
  final FollowNoticeKind kind;
  final Profile profile;

  String get text => switch (kind) {
        FollowNoticeKind.newFollower => '${profile.name} started following you',
        FollowNoticeKind.request => '${profile.name} wants to follow you',
        FollowNoticeKind.accepted => '${profile.name} accepted your follow request',
      };
}
```

- [ ] **Step 4: Mappers**

In `lib/core/api/mappers.dart` add `import '../../models/follows.dart';` next to the models import. Then add to `class ApiMap` (after `friend(...)`):
```dart
  static FollowState followState(Object? s) => switch (s) {
        'following' => FollowState.following,
        'requested' => FollowState.requested,
        _ => FollowState.none,
      };

  static FriendState friendState(Object? s) => switch (s) {
        'friends' => FriendState.friends,
        'requested' => FriendState.requested,
        'incoming' => FriendState.incoming,
        _ => FriendState.none,
      };

  static ProfileView profileView(Map<String, dynamic> m) {
    final rel = Map<String, dynamic>.from((m['rel'] as Map?) ?? const {});
    final counts = m['counts'] is Map ? Map<String, dynamic>.from(m['counts'] as Map) : null;
    final stats = m['stats'];
    return ProfileView(
      profile: profile(Map<String, dynamic>.from(m['profile'] as Map)),
      tier: switch (m['tier']) {
        'self' => ProfileTier.self,
        'following' => ProfileTier.following,
        'friends' => ProfileTier.friends,
        _ => ProfileTier.matched,
      },
      follow: followState(rel['follow']),
      followsYou: rel['followsYou'] == true,
      friend: friendState(rel['friend']),
      followers: counts == null ? null : i(counts['followers']),
      following: counts == null ? null : i(counts['following']),
      stats: stats is Map ? ProfileStats(matches: i(stats['matches']), likes: i(stats['likes']), gifts: i(stats['gifts'])) : null,
      statsHidden: stats == 'hidden',
      online: m['online'] as bool?,
    );
  }

  static FollowEntry followEntry(Map<String, dynamic> m) => FollowEntry(
        profile: profile(Map<String, dynamic>.from(m['profile'] as Map)),
        since: date(m['since']) ?? DateTime.now(),
        followsBack: m['followsBack'] == true,
      );

  /// The follow part of GET/PATCH /me.
  static FollowSettings followSettings(Map<String, dynamic> me) => FollowSettings(
        followers: i(me['followers']),
        following: i(me['following']),
        privateAccount: me['privateAccount'] == true,
        hideStats: me['hideStats'] == true,
      );

  static String reportReasonOut(ReportReason r) => switch (r) {
        ReportReason.nudity => 'NUDITY',
        ReportReason.harassment => 'HARASSMENT',
        ReportReason.underage => 'UNDERAGE',
        ReportReason.spam => 'SPAM',
        ReportReason.scam => 'SCAM',
        ReportReason.other => 'OTHER',
      };
```

- [ ] **Step 5: Event names**

In `lib/core/api/realtime_client.dart`, `class Ev`, after `friendRemoved`:
```dart
  static const followNew = 'social:follow-new';
  static const followRequest = 'social:follow-request';
  static const followAccepted = 'social:follow-accepted';
  static const followRemoved = 'social:follow-removed';
```

- [ ] **Step 6: Run the tests**

Run: `flutter test test/follows_test.dart`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
flutter analyze
git add lib/models/follows.dart lib/core/api/mappers.dart lib/core/api/realtime_client.dart test/follows_test.dart
git commit -m "feat(app): follow and profile-view models"
```

---

### Task 8: `FollowsProvider` (Local + Remote) wired into the app

**Files:**
- Create: `lib/providers/follows_provider.dart`, `lib/providers/follows_provider_local.dart`, `lib/providers/follows_provider_remote.dart`
- Modify: `lib/main.dart`, `lib/app.dart` (`_loadAll`)
- Test: `test/follows_test.dart`

**Interfaces:**
- Consumes: Task 7 models and mappers; `SocialProvider.stateOf/friend/block`; `MockBackend.people`.
- Produces: `abstract class FollowsProvider extends ChangeNotifier` with:
  - `settings` (FollowSettings), `stateOf(userId) → FollowState`, `notices → Stream<FollowNotice>`, `clear()`
  - `load()`, `view(userId) → Future<ProfileView?>` (null = not available)
  - `follow(userId) → Future<FollowState>`, `unfollow(userId)`
  - `list(FollowList, {cursor}) → Future<FollowPage>`
  - `accept(userId)`, `decline(userId)`, `removeFollower(userId)`
  - `report(userId, ReportReason, {note, block})`
  - `setPrivacy({privateAccount, hideStats}) → Future<bool>`
  - `@protected remember(userId, state)` and `@protected announce(notice)` for subclasses and test fakes
  - Factory `FollowsProvider(MockBackend, SocialProvider)` builds the local one; `RemoteFollowsProvider(ApiClient, RealtimeClient)`.
  - Errors from the server surface as `ApiException`. `view()` maps 404 to `null`.

- [ ] **Step 1: Write the failing tests**

Append to `test/follows_test.dart`. Add imports at the top:
```dart
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/api/api_client.dart';
import 'package:vibe_app/core/api/realtime_client.dart';
import 'package:vibe_app/core/api/token_store.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/providers/follows_provider.dart';
import 'package:vibe_app/providers/social_provider.dart';
import 'package:vibe_app/providers/wallet_provider.dart';
```
And inside `main()`:
```dart
  group('RemoteFollowsProvider', () {
    http.Response json(Object body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

    test('follow, view, lists and privacy hit the right endpoints', () async {
      final sent = <String>[];
      final api = ApiClient(
        baseUrl: 'https://api.test/v1',
        tokens: MemoryTokenStore(),
        httpClient: MockClient((req) async {
          sent.add('${req.method} ${req.url.path}${req.body.isEmpty ? '' : ' ${req.body}'}');
          return switch ('${req.method} ${req.url.path}') {
            'POST /v1/follows/u2' => json({'state': 'requested'}),
            'GET /v1/users/u2/view' => json({'profile': {'id': 'u2', 'name': 'Sana'}, 'tier': 'matched', 'rel': {'follow': 'requested'}}),
            'GET /v1/users/gone/view' => json({'error': {'code': 'NOT_FOUND', 'message': 'User not found'}}, 404),
            'GET /v1/me/followers' => json({'items': [{'profile': {'id': 'u3', 'name': 'Ali'}, 'since': '2026-10-05T10:00:00Z', 'followsBack': false}], 'nextCursor': 'c1'}),
            'PATCH /v1/me' => json({'id': 'u1', 'followers': 4, 'following': 1, 'privateAccount': true, 'hideStats': false}),
            _ => json({'id': 'u1', 'followers': 3, 'following': 1}),
          };
        }),
      );
      await api.setTokens({'accessToken': 'a1', 'refreshToken': 'r1'});
      final p = RemoteFollowsProvider(api, RealtimeClient(api));

      expect(await p.follow('u2'), FollowState.requested);
      expect(p.stateOf('u2'), FollowState.requested);
      expect((await p.view('u2'))!.tier, ProfileTier.matched);
      expect(await p.view('gone'), isNull);
      final page = await p.list(FollowList.followers);
      expect(page.items.single.profile.name, 'Ali');
      expect(page.nextCursor, 'c1');
      expect(await p.setPrivacy(privateAccount: true), isTrue);
      expect(p.settings.privateAccount, isTrue);
      expect(p.settings.followers, 4);
      expect(sent, contains('PATCH /v1/me {"privateAccount":true}'));
    });
  });

  group('LocalFollowsProvider', () {
    test('offline demo: follow is instant and opens the profile', () async {
      SharedPreferences.setMockInitialValues({});
      final backend = MockBackend();
      final social = SocialProvider(backend, WalletProvider(backend));
      final follows = FollowsProvider(backend, social);
      final someone = backend.people.first;

      expect((await follows.view(someone.id))!.tier, ProfileTier.matched);
      await follows.follow(someone.id);
      final v = (await follows.view(someone.id))!;
      expect(v.tier, ProfileTier.following);
      expect(v.followers, isNotNull);
      expect(follows.settings.following, 1);
      expect((await follows.list(FollowList.following)).items.single.profile.id, someone.id);
      await follows.unfollow(someone.id);
      expect(follows.settings.following, 0);
      expect(await follows.view('nobody'), isNull);
    });
  });
```

- [ ] **Step 2: Run them and see them fail**

Run: `flutter test test/follows_test.dart`
Expected: FAIL to compile. `Target of URI doesn't exist: 'package:vibe_app/providers/follows_provider.dart'`.

- [ ] **Step 3: The abstract provider**

Create `lib/providers/follows_provider.dart`:
```dart
import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api/api_client.dart';
import '../core/api/api_exception.dart';
import '../core/api/mappers.dart';
import '../core/api/realtime_client.dart';
import '../core/mock/mock_backend.dart';
import '../models/follows.dart';
import '../models/models.dart';
import 'social_provider.dart';

part 'follows_provider_local.dart';
part 'follows_provider_remote.dart';

/// One-way follows and the tiered profile view.
///
/// Following never unlocks chat — that stays with [SocialProvider] friends.
/// [LocalFollowsProvider] is the offline demo; [RemoteFollowsProvider] talks
/// to the Vibe API and hears about new followers live.
abstract class FollowsProvider extends ChangeNotifier {
  FollowsProvider.base();

  factory FollowsProvider(MockBackend backend, SocialProvider social) = LocalFollowsProvider;

  FollowSettings _settings = const FollowSettings();
  final Map<String, FollowState> _states = {};
  final StreamController<FollowNotice> _notices = StreamController<FollowNotice>.broadcast();

  /// Your numbers and privacy switches.
  FollowSettings get settings => _settings;

  /// What we last heard about your follow towards [userId].
  FollowState stateOf(String userId) => _states[userId] ?? FollowState.none;

  /// "X started following you" and friends, for an in-app toast.
  Stream<FollowNotice> get notices => _notices.stream;

  @protected
  void remember(String userId, FollowState state) {
    _states[userId] = state;
    notifyListeners();
  }

  @protected
  void announce(FollowNotice notice) {
    if (!_notices.isClosed) _notices.add(notice);
  }

  /// Sign-out: forget the previous account.
  void clear() {
    _states.clear();
    _settings = const FollowSettings();
    notifyListeners();
  }

  Future<void> load();

  /// Null when the profile can't be shown (never met, blocked, gone).
  Future<ProfileView?> view(String userId);

  /// Follows, or sends a request to a private account.
  Future<FollowState> follow(String userId);

  /// Unfollows, or takes back a request.
  Future<void> unfollow(String userId);

  Future<FollowPage> list(FollowList which, {String? cursor});
  Future<void> accept(String userId);
  Future<void> decline(String userId);
  Future<void> removeFollower(String userId);
  Future<void> report(String userId, ReportReason reason, {String? note, bool block = true});

  /// False when it could not be saved (the switch flips back).
  Future<bool> setPrivacy({bool? privateAccount, bool? hideStats});

  @override
  void dispose() {
    _notices.close();
    super.dispose();
  }
}
```

- [ ] **Step 4: Remote**

Create `lib/providers/follows_provider_remote.dart`:
```dart
part of 'follows_provider.dart';

/// Server mode: follows on the Vibe API; new followers, requests and
/// acceptances arrive over the socket.
class RemoteFollowsProvider extends FollowsProvider {
  RemoteFollowsProvider(this._api, this._rt) : super.base() {
    _subs = [
      _rt.on(Ev.followNew).listen((m) => _onNotice(FollowNoticeKind.newFollower, m['from'])),
      _rt.on(Ev.followRequest).listen((m) => _onNotice(FollowNoticeKind.request, m['from'])),
      _rt.on(Ev.followAccepted).listen((m) => _onNotice(FollowNoticeKind.accepted, m['by'])),
      _rt.on(Ev.followRemoved).listen((_) => _reloadSettings()),
    ];
  }

  final ApiClient _api;
  final RealtimeClient _rt;
  late final List<StreamSubscription> _subs;

  @override
  Future<void> load() async {
    if (!_api.hasSession) return;
    await _reloadSettings();
  }

  Future<void> _reloadSettings() async {
    try {
      _settings = ApiMap.followSettings(Map<String, dynamic>.from(await _api.get('/me') as Map));
      notifyListeners();
    } on ApiException catch (_) {}
  }

  void _onNotice(FollowNoticeKind kind, Object? who) {
    if (who is Map) {
      final p = ApiMap.profile(Map<String, dynamic>.from(who));
      if (kind == FollowNoticeKind.accepted) remember(p.id, FollowState.following);
      announce(FollowNotice(kind, p));
    }
    _reloadSettings();
  }

  @override
  Future<ProfileView?> view(String userId) async {
    try {
      final v = ApiMap.profileView(Map<String, dynamic>.from(await _api.get('/users/$userId/view') as Map));
      remember(userId, v.follow);
      return v;
    } on ApiException catch (e) {
      if (e.status == 404) return null;
      rethrow;
    }
  }

  @override
  Future<FollowState> follow(String userId) async {
    final r = Map<String, dynamic>.from(await _api.post('/follows/$userId') as Map);
    final s = ApiMap.followState(r['state']);
    remember(userId, s);
    unawaited(_reloadSettings());
    return s;
  }

  @override
  Future<void> unfollow(String userId) async {
    await _api.delete('/follows/$userId');
    remember(userId, FollowState.none);
    unawaited(_reloadSettings());
  }

  @override
  Future<FollowPage> list(FollowList which, {String? cursor}) async {
    final path = switch (which) {
      FollowList.followers => '/me/followers',
      FollowList.following => '/me/following',
      FollowList.requests => '/me/follow-requests',
    };
    final r = Map<String, dynamic>.from(await _api.get(path, query: {'limit': '50', if (cursor != null) 'cursor': cursor}) as Map);
    return FollowPage([for (final e in r['items'] as List) ApiMap.followEntry(Map<String, dynamic>.from(e as Map))], r['nextCursor'] as String?);
  }

  @override
  Future<void> accept(String userId) async {
    await _api.post('/me/follow-requests/$userId/accept');
    unawaited(_reloadSettings());
  }

  @override
  Future<void> decline(String userId) async {
    await _api.post('/me/follow-requests/$userId/decline');
  }

  @override
  Future<void> removeFollower(String userId) async {
    await _api.delete('/me/followers/$userId');
    unawaited(_reloadSettings());
  }

  @override
  Future<void> report(String userId, ReportReason reason, {String? note, bool block = true}) async {
    await _api.post('/reports', {'userId': userId, 'reason': ApiMap.reportReasonOut(reason), if (note != null && note.isNotEmpty) 'note': note, 'block': block});
  }

  @override
  Future<bool> setPrivacy({bool? privateAccount, bool? hideStats}) async {
    final before = _settings;
    _settings = _settings.copyWith(privateAccount: privateAccount, hideStats: hideStats);
    notifyListeners();
    try {
      final me = await _api.patch('/me', {if (privateAccount != null) 'privateAccount': privateAccount, if (hideStats != null) 'hideStats': hideStats});
      _settings = ApiMap.followSettings(Map<String, dynamic>.from(me as Map));
      notifyListeners();
      return true;
    } on ApiException catch (_) {
      _settings = before;
      notifyListeners();
      return false;
    }
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    super.dispose();
  }
}
```

- [ ] **Step 5: Local**

Create `lib/providers/follows_provider_local.dart`:
```dart
part of 'follows_provider.dart';

/// Offline demo: every account is public and follows are instant. Numbers
/// come from the profile id so they stay the same between screens.
class LocalFollowsProvider extends FollowsProvider {
  LocalFollowsProvider(this._backend, this._social) : super.base();

  final MockBackend _backend;
  final SocialProvider _social;
  final Map<String, DateTime> _since = {};

  int _seed(String id, int mod) => id.hashCode.abs() % mod;
  int get _followingCount => _states.values.where((s) => s == FollowState.following).length;

  Profile? _person(String id) {
    for (final p in _backend.people) {
      if (p.id == id) return p;
    }
    return _social.friend(id)?.profile;
  }

  @override
  Future<void> load() async {
    _settings = _settings.copyWith(followers: 12, following: _followingCount);
    notifyListeners();
  }

  @override
  Future<ProfileView?> view(String userId) async {
    final p = _person(userId);
    final friend = _social.stateOf(userId);
    if (p == null || friend == FriendState.blocked) return null;
    final follow = stateOf(userId);
    final tier = friend == FriendState.friends ? ProfileTier.friends : (follow == FollowState.following ? ProfileTier.following : ProfileTier.matched);
    final open = tier != ProfileTier.matched;
    return ProfileView(
      profile: p,
      tier: tier,
      follow: follow,
      followsYou: _seed(userId, 3) == 0,
      friend: friend,
      followers: open ? 20 + _seed(userId, 400) : null,
      following: open ? 5 + _seed(userId, 90) : null,
      stats: open ? ProfileStats(matches: p.matches, likes: p.likes, gifts: _seed(userId, 30)) : null,
      online: tier == ProfileTier.friends ? (_social.friend(userId)?.online ?? false) : null,
    );
  }

  @override
  Future<FollowState> follow(String userId) async {
    _since[userId] = DateTime.now();
    _states[userId] = FollowState.following;
    _settings = _settings.copyWith(following: _followingCount);
    notifyListeners();
    return FollowState.following;
  }

  @override
  Future<void> unfollow(String userId) async {
    _since.remove(userId);
    _states[userId] = FollowState.none;
    _settings = _settings.copyWith(following: _followingCount);
    notifyListeners();
  }

  @override
  Future<FollowPage> list(FollowList which, {String? cursor}) async {
    final items = switch (which) {
      FollowList.following => [
          for (final e in _since.entries)
            if (_person(e.key) case final p?) FollowEntry(profile: p, since: e.value, followsBack: _seed(p.id, 3) == 0),
        ],
      FollowList.followers => [
          for (final p in _backend.people.take(12)) FollowEntry(profile: p, since: DateTime.now().subtract(Duration(hours: 3 + _seed(p.id, 200))), followsBack: stateOf(p.id) == FollowState.following),
        ],
      FollowList.requests => <FollowEntry>[],
    };
    return FollowPage(items, null);
  }

  @override
  Future<void> accept(String userId) async {}

  @override
  Future<void> decline(String userId) async {}

  @override
  Future<void> removeFollower(String userId) async {}

  @override
  Future<void> report(String userId, ReportReason reason, {String? note, bool block = true}) async {
    final p = _person(userId);
    if (block && p != null) await _social.block(p);
  }

  @override
  Future<bool> setPrivacy({bool? privateAccount, bool? hideStats}) async {
    _settings = _settings.copyWith(privateAccount: privateAccount, hideStats: hideStats);
    notifyListeners();
    return true;
  }
}
```

- [ ] **Step 6: Wire it into the app**

`lib/main.dart`:
- Add `import 'providers/follows_provider.dart';`.
- After `final CatalogProvider catalog;` add `final FollowsProvider follows;`.
- In the server branch, after `catalog = RemoteCatalogProvider(api, realtime);` add `follows = RemoteFollowsProvider(api, realtime);`.
- In the offline branch, after `catalog = CatalogProvider();` add `follows = FollowsProvider(backend, social);`.
- Inside `if (api != null) { … }` add `session.addSignOutHook(() async => follows.clear());`.
- In `MultiProvider.providers`, after `ChangeNotifierProvider.value(value: social),` add `ChangeNotifierProvider.value(value: follows),`.

`lib/app.dart`: add `import 'providers/follows_provider.dart';`. In `_loadAll()`, after the `SocialProvider` load line, add:
```dart
    if (!mounted) return;
    await context.read<FollowsProvider>().load();
```

- [ ] **Step 7: Run tests + analyze**

Run: `flutter test test/follows_test.dart && flutter analyze`
Expected: PASS (6 tests); analyze shows only the 2 pre-existing infos.

- [ ] **Step 8: Commit**

```bash
git add lib/providers/follows_provider*.dart lib/main.dart lib/app.dart test/follows_test.dart
git commit -m "feat(app): FollowsProvider (server + offline demo)"
```

---

### Task 9: The profile screen (page + sheet)

**Files:**
- Create: `lib/screens/profile/user_profile_screen.dart`
- Create: `test/user_profile_test.dart`

**Interfaces:**
- Consumes: `FollowsProvider` (Task 8); `SocialProvider.stateOf/sendRequest/accept/remove/block/load`; `WalletProvider.freeFriendRequestsLeft`; `Economy.freeFriendRequestsPerDay/friendRequestCost`; `showReportSheet(context, name:) → Future<ReportChoice?>`; `ChatScreen(friendId:)`.
- Produces:
  - `UserProfileScreen({required String userId})` (a page)
  - `UserProfileBody({required String userId, bool inCall = false})`
  - `Future<void> showUserProfileSheet(BuildContext context, String userId)` (opens with `inCall: true`)

- [ ] **Step 1: Write the failing widget tests**

Create `test/user_profile_test.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/models/follows.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/providers/follows_provider.dart';
import 'package:vibe_app/providers/social_provider.dart';
import 'package:vibe_app/providers/wallet_provider.dart';
import 'package:vibe_app/screens/profile/follow_lists_screen.dart';
import 'package:vibe_app/screens/profile/user_profile_screen.dart';

/// A scripted FollowsProvider: tests set the views and read the calls.
class FakeFollows extends FollowsProvider {
  FakeFollows(this.views, {this.pages = const {}}) : super.base();
  final Map<String, ProfileView> views;
  final Map<FollowList, List<FollowEntry>> pages;
  final calls = <String>[];

  @override
  Future<void> load() async {}

  @override
  Future<ProfileView?> view(String userId) async {
    final v = views[userId];
    if (v != null) remember(userId, v.follow);
    return v;
  }

  @override
  Future<FollowState> follow(String userId) async {
    calls.add('follow $userId');
    final v = views[userId];
    if (v != null) {
      views[userId] = ProfileView(profile: v.profile, tier: ProfileTier.following, follow: FollowState.following, followers: 1, following: 0, stats: const ProfileStats(matches: 3, likes: 2, gifts: 1));
    }
    remember(userId, FollowState.following);
    return FollowState.following;
  }

  @override
  Future<void> unfollow(String userId) async => calls.add('unfollow $userId');
  @override
  Future<FollowPage> list(FollowList which, {String? cursor}) async => FollowPage(pages[which] ?? const [], null);
  @override
  Future<void> accept(String userId) async => calls.add('accept $userId');
  @override
  Future<void> decline(String userId) async => calls.add('decline $userId');
  @override
  Future<void> removeFollower(String userId) async => calls.add('remove $userId');
  @override
  Future<void> report(String userId, ReportReason reason, {String? note, bool block = true}) async => calls.add('report $userId');
  @override
  Future<bool> setPrivacy({bool? privateAccount, bool? hideStats}) async => true;
}

const sana = Profile(id: 'u2', name: 'Sana', age: 23, gender: Gender.female, country: Country('PK', 'Pakistan', '🇵🇰'), avatarUrl: '', bio: 'Coffee first', interests: ['Music', 'Travel']);

Future<FakeFollows> pump(WidgetTester tester, FakeFollows follows, Widget screen) async {
  SharedPreferences.setMockInitialValues({});
  final backend = MockBackend();
  final wallet = WalletProvider(backend);
  final social = SocialProvider(backend, wallet);
  tester.view.physicalSize = const Size(412 * 3, 892 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MultiProvider(
    providers: [
      ChangeNotifierProvider<WalletProvider>.value(value: wallet),
      ChangeNotifierProvider<SocialProvider>.value(value: social),
      ChangeNotifierProvider<FollowsProvider>.value(value: follows),
    ],
    child: MaterialApp(theme: V.theme(), home: screen),
  ));
  await tester.pumpAndSettle();
  return follows;
}

void main() {
  testWidgets('matched: the profile, a Follow button, stats locked', (tester) async {
    await pump(tester, FakeFollows({'u2': const ProfileView(profile: sana, tier: ProfileTier.matched)}), const UserProfileScreen(userId: 'u2'));
    expect(find.text('Sana, 23'), findsOneWidget);
    expect(find.text('Coffee first'), findsOneWidget);
    expect(find.text('Follow'), findsOneWidget);
    expect(find.text('Add friend'), findsOneWidget);
    expect(find.text('Follow to see their stats'), findsOneWidget);
    expect(find.textContaining('follower'), findsNothing);
  });

  testWidgets('tapping Follow opens counts and stats', (tester) async {
    final f = await pump(tester, FakeFollows({'u2': const ProfileView(profile: sana, tier: ProfileTier.matched)}), const UserProfileScreen(userId: 'u2'));
    await tester.tap(find.text('Follow'));
    await tester.pumpAndSettle();
    expect(f.calls, ['follow u2']);
    expect(find.text('Following'), findsOneWidget);
    expect(find.text('Matches'), findsOneWidget);
    expect(find.textContaining('1 follower'), findsOneWidget);
  });

  testWidgets('hidden stats and "Follows you"', (tester) async {
    await pump(
      tester,
      FakeFollows({'u2': const ProfileView(profile: sana, tier: ProfileTier.following, follow: FollowState.following, followsYou: true, followers: 128, following: 40, statsHidden: true)}),
      const UserProfileScreen(userId: 'u2'),
    );
    expect(find.text('Stats hidden'), findsOneWidget);
    expect(find.text('Follows you'), findsOneWidget);
    expect(find.textContaining('128'), findsOneWidget);
  });

  testWidgets('a profile you may not see', (tester) async {
    await pump(tester, FakeFollows({}), const UserProfileScreen(userId: 'nobody'));
    expect(find.text('Profile not available'), findsOneWidget);
  });
}
```
(The `follow_lists_screen.dart` import is used by Task 10's test. Until Task 10 adds it, comment that import out.)

- [ ] **Step 2: Run them and see them fail**

Run: `flutter test test/user_profile_test.dart`
Expected: FAIL to compile. `Target of URI doesn't exist: 'package:vibe_app/screens/profile/user_profile_screen.dart'`.

- [ ] **Step 3: The screen**

Create `lib/screens/profile/user_profile_screen.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/follows.dart';
import '../../models/models.dart';
import '../../providers/follows_provider.dart';
import '../../providers/social_provider.dart';
import '../../providers/wallet_provider.dart';
import '../match/report_sheet.dart';
import '../social/chat_screen.dart';

/// Someone else's profile. It opens up as you get closer: matched → following
/// (counts, stats) → friends (online, Message).
class UserProfileScreen extends StatelessWidget {
  const UserProfileScreen({super.key, required this.userId});
  final String userId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: Center(child: CircleIconButton(icon: Icons.arrow_back_rounded, tooltip: 'Back', onTap: () => Navigator.of(context).maybePop())),
        leadingWidth: 64,
      ),
      body: SingleChildScrollView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 32), child: UserProfileBody(userId: userId)),
    );
  }
}

/// Opens a profile over whatever is on screen — used in a live call, so the call keeps going.
Future<void> showUserProfileSheet(BuildContext context, String userId) => showVibeSheet<void>(
      context,
      scrollable: true,
      child: Padding(padding: const EdgeInsets.fromLTRB(20, 8, 20, 20), child: UserProfileBody(userId: userId, inCall: true)),
    );

class UserProfileBody extends StatefulWidget {
  const UserProfileBody({super.key, required this.userId, this.inCall = false});
  final String userId;

  /// In a call: no jumping to chat (the call screen stays underneath).
  final bool inCall;

  @override
  State<UserProfileBody> createState() => _UserProfileBodyState();
}

class _UserProfileBodyState extends State<UserProfileBody> {
  ProfileView? _view;
  bool _loading = true;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final v = await context.read<FollowsProvider>().view(widget.userId);
      if (mounted) {
        setState(() {
          _view = v;
          _loading = false;
        });
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      toast(context, e.message, error: true);
    }
  }

  /// Runs an action, then re-reads the profile (the tier may have changed).
  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      await _load();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _follow() => _run(() async {
        final s = await context.read<FollowsProvider>().follow(widget.userId);
        if (mounted && s == FollowState.requested) toast(context, 'Request sent. They have a private account.');
      });

  Future<void> _unfollow(String name, FollowState s) async {
    final pending = s == FollowState.requested;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(pending ? 'Cancel your request?' : 'Unfollow $name?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Keep', style: TextStyle(color: V.text2))),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text(pending ? 'Cancel request' : 'Unfollow', style: const TextStyle(color: V.bad))),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await _run(() => context.read<FollowsProvider>().unfollow(widget.userId));
  }

  Future<void> _friendAction(Profile p, FriendState s) async {
    final social = context.read<SocialProvider>();
    switch (s) {
      case FriendState.friends:
        if (!widget.inCall) await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(friendId: p.id)));
      case FriendState.incoming:
        await _run(() async => social.accept(p.id));
      case FriendState.none:
        if (context.read<WalletProvider>().freeFriendRequestsLeft == 0) {
          final ok = await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('Send a friend request?'),
              content: Text('Your ${Economy.freeFriendRequestsPerDay} free requests for today are used. This one costs ${Economy.friendRequestCost} coins.'),
              actions: [
                TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel', style: TextStyle(color: V.text2))),
                TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text('Send for ${Economy.friendRequestCost}')),
              ],
            ),
          );
          if (ok != true || !mounted) return;
        }
        await _run(() async {
          final sent = await social.sendRequest(p);
          if (!mounted) return;
          toast(context, sent ? 'Request sent' : 'Not enough coins for another request today', error: !sent);
        });
      case FriendState.requested:
      case FriendState.blocked:
        return;
    }
  }

  Future<void> _menu(String action, ProfileView v) async {
    final p = v.profile;
    final social = context.read<SocialProvider>();
    final follows = context.read<FollowsProvider>();
    switch (action) {
      case 'remove-follower':
        await _run(() => follows.removeFollower(p.id));
      case 'unfriend':
        await _run(() => social.remove(p.id));
      case 'report':
        final choice = await showReportSheet(context, name: p.name);
        if (choice == null || !mounted) return;
        await _run(() => follows.report(p.id, choice.reason, note: choice.note, block: choice.block));
        if (choice.block) await social.load();
        if (mounted) toast(context, 'Thanks. ${p.name} was reported${choice.block ? ' and blocked' : ''}.');
      case 'block':
        await social.block(p);
        if (mounted) Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final follow = context.select<FollowsProvider, FollowState>((f) => f.stateOf(widget.userId));
    final friend = context.select<SocialProvider, FriendState>((s) => s.stateOf(widget.userId));
    if (_loading) return const Padding(padding: EdgeInsets.symmetric(vertical: 80), child: Center(child: CircularProgressIndicator(color: V.pink)));
    final v = _view;
    if (v == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: EmptyState(icon: Icons.person_off_rounded, title: 'Profile not available', body: 'You can see the profiles of people you have met in a match.'),
      );
    }
    final p = v.profile;
    final self = v.tier == ProfileTier.self;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              children: [
                VAvatar(url: p.avatarUrl, name: p.name, size: 84, ring: true),
                if (v.online == true)
                  Positioned(right: 2, bottom: 2, child: Container(width: 18, height: 18, decoration: BoxDecoration(shape: BoxShape.circle, color: V.ok, border: Border.all(color: V.bg, width: 3)))),
              ],
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Flexible(child: Text('${p.name}, ${p.age}', overflow: TextOverflow.ellipsis, style: VT.display(26, height: 1.1))),
                      if (p.verified) const Padding(padding: EdgeInsets.only(left: 6), child: Icon(Icons.verified_rounded, color: V.trust, size: 20, semanticLabel: 'Verified')),
                      if (p.vip) const Padding(padding: EdgeInsets.only(left: 4), child: Icon(Icons.workspace_premium_rounded, color: V.gold, size: 19, semanticLabel: 'VIP')),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text('${p.country.flag} ${p.country.name}${v.online == true ? ' · Online now' : ''}', style: VT.body(13, color: V.text2)),
                  if (v.followsYou) const Padding(padding: EdgeInsets.only(top: 8), child: Tag('Follows you', color: V.violet)),
                ],
              ),
            ),
            if (!self)
              PopupMenuButton<String>(
                icon: const Icon(Icons.more_horiz_rounded, color: V.text2),
                tooltip: 'More',
                onSelected: (a) => _menu(a, v),
                itemBuilder: (_) => [
                  if (v.followsYou) const PopupMenuItem(value: 'remove-follower', child: Text('Remove follower')),
                  if (friend == FriendState.friends) const PopupMenuItem(value: 'unfriend', child: Text('Unfriend')),
                  const PopupMenuItem(value: 'report', child: Text('Report')),
                  const PopupMenuItem(value: 'block', child: Text('Block', style: TextStyle(color: V.bad))),
                ],
              ),
          ],
        ),
        if (!self) ...[
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(child: _followButton(p, follow)),
              const SizedBox(width: 10),
              Expanded(child: _friendButton(p, friend)),
            ],
          ),
        ],
        if (v.followers != null) ...[
          const SizedBox(height: 16),
          Text.rich(TextSpan(children: [
            TextSpan(text: Fmt.thousands(v.followers!), style: VT.number(15, weight: FontWeight.w600)),
            TextSpan(text: v.followers == 1 ? ' follower' : ' followers', style: VT.body(13.5, color: V.text2)),
            TextSpan(text: '  ·  ', style: VT.body(13.5, color: V.muted)),
            TextSpan(text: Fmt.thousands(v.following ?? 0), style: VT.number(15, weight: FontWeight.w600)),
            TextSpan(text: ' following', style: VT.body(13.5, color: V.text2)),
          ])),
        ],
        const SizedBox(height: 16),
        _StatsBlock(view: v),
        if (p.bio.trim().isNotEmpty) ...[
          const SectionTitle('About', top: 22, bottom: 8),
          Text(p.bio, style: VT.body(14.5, color: V.text)),
        ],
        if (p.interests.isNotEmpty) ...[
          const SectionTitle('Interests', top: 22, bottom: 10),
          Wrap(spacing: 6, runSpacing: 6, children: [for (final i in p.interests) Tag(i, color: V.violet)]),
        ],
      ],
    );
  }

  Widget _followButton(Profile p, FollowState s) => switch (s) {
        FollowState.none => GradientButton(label: 'Follow', icon: Icons.person_add_alt_1_rounded, height: 46, busy: _busy, onTap: _follow),
        FollowState.requested => GhostButton(label: 'Requested', icon: Icons.hourglass_top_rounded, height: 46, expand: true, onTap: _busy ? null : () => _unfollow(p.name, s)),
        FollowState.following => GhostButton(label: 'Following', icon: Icons.check_rounded, height: 46, expand: true, onTap: _busy ? null : () => _unfollow(p.name, s)),
      };

  Widget _friendButton(Profile p, FriendState s) => switch (s) {
        FriendState.friends => GhostButton(label: 'Message', icon: Icons.chat_bubble_outline_rounded, height: 46, expand: true, onTap: widget.inCall ? null : () => _friendAction(p, s)),
        FriendState.incoming => GhostButton(label: 'Accept friend', icon: Icons.how_to_reg_rounded, height: 46, expand: true, onTap: () => _friendAction(p, s)),
        FriendState.requested => const GhostButton(label: 'Request sent', icon: Icons.hourglass_top_rounded, height: 46, expand: true),
        FriendState.blocked => const SizedBox.shrink(),
        FriendState.none => GhostButton(label: 'Add friend', icon: Icons.person_add_rounded, height: 46, expand: true, onTap: () => _friendAction(p, s)),
      };
}

/// Matches · Likes · Gifts, or why you can't see them.
class _StatsBlock extends StatelessWidget {
  const _StatsBlock({required this.view});
  final ProfileView view;

  @override
  Widget build(BuildContext context) {
    final s = view.stats;
    if (s != null) {
      Widget cell(int n, String label) => Expanded(
            child: Column(children: [Text(Fmt.thousands(n), style: VT.number(20)), const SizedBox(height: 2), Text(label, style: VT.body(11, color: V.muted, height: 1.2))]),
          );
      return Panel(padding: const EdgeInsets.symmetric(vertical: 16), child: Row(children: [cell(s.matches, 'Matches'), cell(s.likes, 'Likes'), cell(s.gifts, 'Gifts')]));
    }
    final (icon, text) = view.statsHidden ? (Icons.visibility_off_rounded, 'Stats hidden') : (Icons.lock_outline_rounded, 'Follow to see their stats');
    return Panel(
      padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 16),
      child: Row(children: [Icon(icon, size: 18, color: V.muted), const SizedBox(width: 10), Expanded(child: Text(text, style: VT.body(13, color: V.text2)))]),
    );
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `flutter test test/user_profile_test.dart`
Expected: PASS (4 tests). If `find.text('Follow')` matches two widgets, check that the stats text is `Follow to see their stats` (`find.text` matches whole strings only).

- [ ] **Step 5: Analyze + commit**

```bash
flutter analyze
git add lib/screens/profile/user_profile_screen.dart test/user_profile_test.dart
git commit -m "feat(app): user profile screen with tiers, follow and friend actions"
```

---

### Task 10: App entry points — call, Me, chat, lists, pushes

**Files:**
- Create: `lib/screens/profile/follow_lists_screen.dart`
- Modify: `lib/screens/match/match_screen.dart` (imports; `_Connected.build` top row; add `_FollowPill`)
- Modify: `lib/screens/profile/profile_screen.dart` (imports; after `_StatsCard`; `_matchRow`)
- Modify: `lib/screens/social/chat_screen.dart` (AppBar title)
- Modify: `lib/services/push/push_route.dart`
- Modify: `lib/screens/home/home_shell.dart` (`_open`, notices toast)
- Test: `test/user_profile_test.dart`, `test/follows_test.dart`

**Interfaces:**
- Consumes: `UserProfileScreen`, `showUserProfileSheet` (Task 9); `FollowsProvider` (Task 8).
- Produces: `FollowListsScreen({FollowList initial = FollowList.followers})`; `PushTarget.profile` (with `PushRoute.userId`) and `PushTarget.followRequests`.

- [ ] **Step 1: Write the failing tests**

In `test/user_profile_test.dart`, uncomment the `follow_lists_screen.dart` import and add:
```dart
  testWidgets('followers list: follow back and remove', (tester) async {
    final f = await pump(
      tester,
      FakeFollows({}, pages: {
        FollowList.followers: [FollowEntry(profile: sana, since: DateTime(2026, 10, 1))],
      }),
      const FollowListsScreen(),
    );
    expect(find.text('Sana, 23 🇵🇰'), findsOneWidget);
    await tester.tap(find.text('Follow back'));
    await tester.pumpAndSettle();
    expect(f.calls, ['follow u2']);
    expect(find.text('Follow back'), findsNothing);
    await tester.tap(find.byTooltip('More'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remove follower'));
    await tester.pumpAndSettle();
    expect(f.calls.last, 'remove u2');
    expect(find.text('No followers yet'), findsOneWidget);
  });
```
In `test/follows_test.dart` add the import `import 'package:vibe_app/services/push/push_route.dart';` and this test inside `main()`:
```dart
  test('push routes for follows', () {
    expect(PushRoute.fromData({'route': 'profile', 'userId': 'u9', 'category': 'social'}), const PushRoute(PushTarget.profile, userId: 'u9'));
    expect(PushRoute.fromData({'route': 'profile'}), isNull);
    expect(PushRoute.fromData({'route': 'follow-requests'}), const PushRoute(PushTarget.followRequests));
  });
```

- [ ] **Step 2: Run them and see them fail**

Run: `flutter test test/user_profile_test.dart test/follows_test.dart`
Expected: FAIL to compile (`follow_lists_screen.dart` missing; `PushTarget.profile` undefined).

- [ ] **Step 3: The lists screen**

Create `lib/screens/profile/follow_lists_screen.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/follows.dart';
import '../../providers/follows_provider.dart';
import 'user_profile_screen.dart';

/// Your followers, who you follow, and (private accounts) waiting requests.
/// Only you can see these lists.
class FollowListsScreen extends StatelessWidget {
  const FollowListsScreen({super.key, this.initial = FollowList.followers});
  final FollowList initial;

  static String _label(FollowList t) => switch (t) {
        FollowList.followers => 'Followers',
        FollowList.following => 'Following',
        FollowList.requests => 'Requests',
      };

  @override
  Widget build(BuildContext context) {
    final private = context.select<FollowsProvider, bool>((f) => f.settings.privateAccount);
    final tabs = [FollowList.followers, FollowList.following, if (private) FollowList.requests];
    return DefaultTabController(
      key: ValueKey(tabs.length),
      length: tabs.length,
      initialIndex: tabs.contains(initial) ? tabs.indexOf(initial) : 0,
      child: Scaffold(
        appBar: AppBar(
          leading: Center(child: CircleIconButton(icon: Icons.arrow_back_rounded, tooltip: 'Back', onTap: () => Navigator.of(context).maybePop())),
          leadingWidth: 64,
          title: Text('Followers', style: VT.title(17, weight: FontWeight.w600)),
          bottom: TabBar(
            indicatorColor: V.pink,
            labelColor: V.text,
            unselectedLabelColor: V.muted,
            dividerColor: V.lineSoft,
            tabs: [for (final t in tabs) Tab(text: _label(t))],
          ),
        ),
        body: TabBarView(children: [for (final t in tabs) _FollowListTab(which: t)]),
      ),
    );
  }
}

class _FollowListTab extends StatefulWidget {
  const _FollowListTab({required this.which});
  final FollowList which;

  @override
  State<_FollowListTab> createState() => _FollowListTabState();
}

class _FollowListTabState extends State<_FollowListTab> with AutomaticKeepAliveClientMixin {
  final List<FollowEntry> _items = [];
  final Set<String> _followedBack = {};
  String? _cursor;
  bool _loaded = false;
  bool _fetching = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _more();
  }

  Future<void> _more() async {
    if (_fetching || (_loaded && _cursor == null)) return;
    _fetching = true;
    try {
      final page = await context.read<FollowsProvider>().list(widget.which, cursor: _cursor);
      if (!mounted) return;
      setState(() {
        _items.addAll(page.items);
        _cursor = page.nextCursor;
        _loaded = true;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _loaded = true);
      toast(context, e.message, error: true);
    } finally {
      _fetching = false;
    }
  }

  Future<void> _act(Future<void> Function(FollowsProvider f) action, {VoidCallback? after}) async {
    try {
      await action(context.read<FollowsProvider>());
      if (mounted && after != null) setState(after);
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
  }

  Future<void> _unfollow(FollowEntry e) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Unfollow ${e.profile.name}?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Keep', style: TextStyle(color: V.text2))),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Unfollow', style: TextStyle(color: V.bad))),
        ],
      ),
    );
    if (ok == true) await _act((f) => f.unfollow(e.profile.id), after: () => _items.remove(e));
  }

  Widget _trailing(FollowEntry e) {
    final id = e.profile.id;
    return switch (widget.which) {
      FollowList.requests => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextButton(onPressed: () => _act((f) => f.decline(id), after: () => _items.remove(e)), child: const Text('Decline', style: TextStyle(color: V.text2))),
            GradientButton(label: 'Accept', height: 36, expand: false, onTap: () => _act((f) => f.accept(id), after: () => _items.remove(e))),
          ],
        ),
      FollowList.following => GhostButton(label: 'Following', height: 34, onTap: () => _unfollow(e)),
      FollowList.followers => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!e.followsBack && !_followedBack.contains(id)) GhostButton(label: 'Follow back', height: 34, onTap: () => _act((f) async => f.follow(id), after: () => _followedBack.add(id))),
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_horiz_rounded, color: V.muted),
              tooltip: 'More',
              onSelected: (_) => _act((f) => f.removeFollower(id), after: () => _items.remove(e)),
              itemBuilder: (_) => const [PopupMenuItem(value: 'remove', child: Text('Remove follower', style: TextStyle(color: V.bad)))],
            ),
          ],
        ),
    };
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (!_loaded) return const Center(child: CircularProgressIndicator(color: V.pink));
    if (_items.isEmpty) {
      return switch (widget.which) {
        FollowList.followers => const EmptyState(icon: Icons.group_outlined, title: 'No followers yet', body: 'People you meet can follow you from your profile.'),
        FollowList.following => const EmptyState(icon: Icons.person_search_rounded, title: "You don't follow anyone", body: "Tap Follow on someone's profile after a match."),
        FollowList.requests => const EmptyState(icon: Icons.inbox_outlined, title: 'No requests', body: 'While your account is private, new followers wait here.'),
      };
    }
    return NotificationListener<ScrollNotification>(
      onNotification: (n) {
        if (n.metrics.extentAfter < 400) _more();
        return false;
      },
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(20, 8, 12, 32),
        itemCount: _items.length,
        separatorBuilder: (_, __) => const Divider(height: 1, color: V.lineSoft),
        itemBuilder: (context, i) {
          final e = _items[i];
          return InkWell(
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => UserProfileScreen(userId: e.profile.id))),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Row(
                children: [
                  VAvatar(url: e.profile.avatarUrl, name: e.profile.name, size: 44),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${e.profile.name}, ${e.profile.age} ${e.profile.country.flag}', overflow: TextOverflow.ellipsis, style: VT.title(15, weight: FontWeight.w600)),
                        const SizedBox(height: 1),
                        Text(Fmt.ago(e.since), style: VT.body(12, color: V.text2)),
                      ],
                    ),
                  ),
                  _trailing(e),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
```

- [ ] **Step 4: Push routes**

In `lib/services/push/push_route.dart`:
- Constructor and fields:
```dart
  const PushRoute(this.target, {this.friendId, this.userId, this.purchaseId, this.cashoutId});

  final PushTarget target;
  final String? friendId;
  /// The person to show (route `profile`).
  final String? userId;
  final String? purchaseId;
  final String? cashoutId;
```
- In `fromData`'s switch, before `_ => null,` add:
```dart
      'profile' => s('userId') != null ? PushRoute(PushTarget.profile, userId: s('userId')) : null,
      'follow-requests' => const PushRoute(PushTarget.followRequests),
```
- Equality:
```dart
  @override
  bool operator ==(Object other) => other is PushRoute && other.target == target && other.friendId == friendId && other.userId == userId && other.purchaseId == purchaseId && other.cashoutId == cashoutId;
  @override
  int get hashCode => Object.hash(target, friendId, userId, purchaseId, cashoutId);
```
- `enum PushTarget { chat, friends, inbox, wallet, store, profile, followRequests }`
- Update the class doc comment to list `profile + userId | follow-requests`.

- [ ] **Step 5: Home shell — route pushes and show live notices**

In `lib/screens/home/home_shell.dart` add imports:
```dart
import '../../core/theme/vibe_widgets.dart';
import '../../models/follows.dart';
import '../../providers/follows_provider.dart';
import '../profile/follow_lists_screen.dart';
import '../profile/user_profile_screen.dart';
```
Add a field next to `_taps`:
```dart
  StreamSubscription<FollowNotice>? _followNotices;
```
At the end of `initState()` add:
```dart
    _followNotices = context.read<FollowsProvider>().notices.listen((n) {
      if (mounted) toast(context, n.text);
    });
```
In `dispose()`, before `super.dispose();`, add `_followNotices?.cancel();`.
In `_open`'s switch add:
```dart
      case PushTarget.profile:
        nav.push(MaterialPageRoute(builder: (_) => UserProfileScreen(userId: r.userId!)));
      case PushTarget.followRequests:
        nav.push(MaterialPageRoute(builder: (_) => const FollowListsScreen(initial: FollowList.requests)));
```

- [ ] **Step 6: Live call — tap the partner, Follow pill**

In `lib/screens/match/match_screen.dart` add imports:
```dart
import '../../models/follows.dart';
import '../../providers/follows_provider.dart';
import '../profile/user_profile_screen.dart';
```
In `_Connected.build`, the identity pill in the top row: replace
```dart
                Flexible(
                  child: Glass(
                    radius: 24,
```
with
```dart
                Flexible(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => showUserProfileSheet(context, p.id),
                    child: Glass(
                    radius: 24,
```
and close the new `GestureDetector`. Replace the end of that pill plus the timer start
```dart
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Glass(
                  radius: 16,
                  height: 32,
```
with
```dart
                    ),
                  ),
                  ),
                ),
                const SizedBox(width: 8),
                Glass(
                  radius: 16,
                  height: 32,
```
(The indentation inside the wrapped block is off by two spaces. Leave it rather than reformatting the file.)

Then put the Follow pill before Report. Replace
```dart
                const SizedBox(width: 8),
                GlassPill(label: 'Report', icon: Icons.flag_rounded, tint: V.bad, height: 36, onTap: onReport),
```
with
```dart
                const SizedBox(width: 8),
                _FollowPill(userId: p.id),
                const SizedBox(width: 8),
                GlassPill(label: 'Report', icon: Icons.flag_rounded, tint: V.bad, height: 36, onTap: onReport),
```
Add at the end of the file:
```dart
/// Follow from the call's top bar. Reads the partner's profile once so it
/// knows whether you already follow them.
class _FollowPill extends StatefulWidget {
  const _FollowPill({required this.userId});
  final String userId;

  @override
  State<_FollowPill> createState() => _FollowPillState();
}

class _FollowPillState extends State<_FollowPill> {
  @override
  void initState() {
    super.initState();
    final follows = context.read<FollowsProvider>();
    Future(() async {
      try {
        await follows.view(widget.userId);
      } on ApiException catch (_) {}
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = context.select<FollowsProvider, FollowState>((f) => f.stateOf(widget.userId));
    return GlassPill(
      label: switch (s) { FollowState.none => 'Follow', FollowState.requested => 'Requested', FollowState.following => 'Following' },
      icon: switch (s) { FollowState.none => Icons.person_add_alt_1_rounded, FollowState.requested => Icons.hourglass_top_rounded, FollowState.following => Icons.check_rounded },
      tint: s == FollowState.none ? V.violet : null,
      height: 36,
      onTap: s != FollowState.none
          ? null
          : () async {
              try {
                await context.read<FollowsProvider>().follow(widget.userId);
              } on ApiException catch (e) {
                if (context.mounted) toast(context, e.message, error: true);
              }
            },
    );
  }
}
```

Call ended: in `_Ended.build` (same file, `final p = m.lastPartner!;`), make the big photo open the profile. Replace
```dart
                              VAvatar(url: p.avatarUrl, name: p.name, size: 92, ring: true, gapColor: V.surface),
```
with
```dart
                              GestureDetector(
                                onTap: () => showUserProfileSheet(context, p.id),
                                child: Semantics(button: true, label: 'Open ${p.name}\'s profile', child: VAvatar(url: p.avatarUrl, name: p.name, size: 92, ring: true, gapColor: V.surface)),
                              ),
```

- [ ] **Step 7: Me — Followers section, privacy switches, tappable recent matches**

In `lib/screens/profile/profile_screen.dart` add imports:
```dart
import '../../providers/follows_provider.dart';
import 'follow_lists_screen.dart';
import 'user_profile_screen.dart';
```
After `_StatsCard(me: me, friends: social.friends.length, match: match),` insert:
```dart
                  const SizedBox(height: 10),
                  const _FollowSection(),
```
Change the recent-matches call site from `_matchRow(r, last: …)` to `_matchRow(context, r, last: …)`, i.e.
```dart
                    for (final (i, r) in match.history.take(8).indexed) _matchRow(context, r, last: i == (match.history.length.clamp(0, 8) - 1)),
```
Rename the existing method `Widget _matchRow(MatchRecord r, {required bool last}) {` to `Widget _matchRowContent(MatchRecord r, {required bool last}) {` and add above it:
```dart
  Widget _matchRow(BuildContext context, MatchRecord r, {required bool last}) => InkWell(
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => UserProfileScreen(userId: r.partner.id))),
        child: _matchRowContent(r, last: last),
      );
```
Add at the end of the file:
```dart
/// Your followers (only you see the lists) and the two privacy switches.
class _FollowSection extends StatelessWidget {
  const _FollowSection();

  @override
  Widget build(BuildContext context) {
    final follows = context.watch<FollowsProvider>();
    final s = follows.settings;
    Future<void> save({bool? privateAccount, bool? hideStats}) async {
      final ok = await follows.setPrivacy(privateAccount: privateAccount, hideStats: hideStats);
      if (!ok && context.mounted) toast(context, "Couldn't save that, try again", error: true);
    }

    return GroupCard(
      dividerInset: 52,
      children: [
        GroupRow(
          bare: true,
          icon: Icons.people_alt_rounded,
          title: '${Fmt.thousands(s.followers)} ${s.followers == 1 ? 'follower' : 'followers'} · ${Fmt.thousands(s.following)} following',
          subtitle: 'Only you can see these lists.',
          trailing: const Icon(Icons.chevron_right_rounded, color: V.muted),
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const FollowListsScreen())),
        ),
        GroupRow(
          bare: true,
          icon: Icons.lock_outline_rounded,
          title: 'Private account',
          subtitle: 'New followers need your OK first.',
          trailing: Switch(value: s.privateAccount, onChanged: (on) => save(privateAccount: on)),
        ),
        GroupRow(
          bare: true,
          icon: Icons.visibility_off_outlined,
          title: 'Hide my stats',
          subtitle: 'Matches, likes and gifts stay private.',
          trailing: Switch(value: s.hideStats, onChanged: (on) => save(hideStats: on)),
        ),
      ],
    );
  }
}
```

- [ ] **Step 8: Chat header opens the profile**

In `lib/screens/social/chat_screen.dart` add `import '../profile/user_profile_screen.dart';`. In the `AppBar`, replace
```dart
        title: Row(
          children: [
            Stack(
```
with
```dart
        title: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => UserProfileScreen(userId: widget.friendId))),
          child: Row(
          children: [
            Stack(
```
and replace
```dart
        ),
        actions: [
          PopupMenuButton<String>(
```
with
```dart
        ),
        ),
        actions: [
          PopupMenuButton<String>(
```

- [ ] **Step 9: Run all app tests + analyze**

Run: `flutter test && flutter analyze`
Expected: all tests PASS (existing + `follows_test.dart` 7 + `user_profile_test.dart` 5); analyze shows only the 2 pre-existing infos.

- [ ] **Step 10: Manual check in the offline demo**

Run: `flutter run -d chrome` (no `VIBE_API`, so the offline mock runs).
1. Start a match, tap the partner's name, and check that the profile sheet opens while the call keeps running. End the call and tap the big photo on the ended card: the same sheet opens.
2. Tap **Follow**. The pill reads **Following**, and the sheet now shows counts and stats.
3. Go to Me → Followers row → lists. Check that **Follow back** works.
4. Switch on Private account and check that the Requests tab appears.

- [ ] **Step 11: Commit**

```bash
git add lib test
git commit -m "feat(app): follow from calls, profile entry points, follower lists, privacy switches, follow pushes"
```

---
# Part C — Web app

Run everything from `apps/vibe/web`. Checks: `npm run lint && npm run typecheck && npm test`.

### Task 11: Types, mappers, events, `useFollows` store

**Files:**
- Modify: `src/lib/models.ts` (append types)
- Modify: `src/lib/api/mappers.ts` (type import + new mappers)
- Modify: `src/lib/api/realtime.ts` (`Ev`)
- Create: `src/stores/follows.ts`
- Modify: `src/stores/runtime.ts` (load + reset)
- Create: `src/lib/__tests__/follows.test.ts`

**Interfaces:**
- Produces:
  - Types `ProfileTier`, `FollowState`, `FollowList`, `ProfileStats`, `ProfileView { profile; tier; follow; followsYou; friend: Exclude<FriendState, "blocked">; counts: {followers, following} | null; stats: ProfileStats | "hidden" | null; online: boolean | null }`, `FollowEntry { profile; since: Date; followsBack }`, `FollowSettings { followers; following; privateAccount; hideStats }`.
  - Mappers `followState(v)`, `profileView(m)`, `followEntry(m)`, `followSettings(m)`.
  - Store `useFollows` with `settings`, `states`, `load()`, `view(id) → ProfileView | null`, `follow(id) → FollowState`, `unfollow(id)`, `list(which, cursor?) → { items, nextCursor }`, `accept(id)`, `decline(id)`, `removeFollower(id)`, `report(id, { reason, note?, block })`, `setPrivacy(patch) → boolean`, `reset()`.
  - Selector `followStateOf(s, id)`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/follows.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { followEntry, followSettings, followState, profileView } from "../api/mappers";

describe("follow mappers", () => {
  it("matched tier: no counts, no stats", () => {
    const v = profileView({ profile: { id: "u2", name: "Sana" }, tier: "matched", rel: { follow: "requested", followsYou: true, friend: "none" } });
    expect(v).toMatchObject({ tier: "matched", follow: "requested", followsYou: true, friend: "none", counts: null, stats: null, online: null });
    expect(v.profile.name).toBe("Sana");
  });

  it("following tier with hidden stats", () => {
    const v = profileView({ profile: { id: "u2" }, tier: "following", rel: { follow: "following" }, counts: { followers: 12, following: 3 }, stats: "hidden" });
    expect(v).toMatchObject({ counts: { followers: 12, following: 3 }, stats: "hidden" });
  });

  it("friends tier with stats and presence; unknown values fall back", () => {
    const v = profileView({ profile: { id: "u2" }, tier: "friends", rel: { friend: "friends", follow: "bogus" }, counts: { followers: 1, following: 1 }, stats: { matches: 40, likes: 9, gifts: 3 }, online: true });
    expect(v).toMatchObject({ tier: "friends", friend: "friends", follow: "none", stats: { matches: 40, likes: 9, gifts: 3 }, online: true });
    expect(profileView({ profile: { id: "x" }, tier: "admin" }).tier).toBe("matched");
  });

  it("entries, settings and states", () => {
    expect(followEntry({ profile: { id: "u3" }, since: "2026-10-05T10:00:00Z", followsBack: true })).toMatchObject({ profile: { id: "u3" }, followsBack: true });
    expect(followSettings({ followers: 4, following: 1, privateAccount: true })).toEqual({ followers: 4, following: 1, privateAccount: true, hideStats: false });
    expect(followState("following")).toBe("following");
    expect(followState(undefined)).toBe("none");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/lib/__tests__/follows.test.ts`
Expected: FAIL. `profileView is not a function` (or a TS import error).

- [ ] **Step 3: Types**

Append to `src/lib/models.ts`:
```ts
// ── follows ──────────────────────────────────────────────────────────────

/** How much of someone's profile you may see (the server decides). */
export type ProfileTier = "self" | "matched" | "following" | "friends";
/** Your follow towards someone. */
export type FollowState = "none" | "requested" | "following";
/** Your own lists (nobody else's are ever shown). */
export type FollowList = "followers" | "following" | "requests";

export interface ProfileStats {
  matches: number;
  likes: number;
  gifts: number;
}

/** GET /users/:id/view. `counts`/`stats` are null below the "following" tier. */
export interface ProfileView {
  profile: Profile;
  tier: ProfileTier;
  follow: FollowState;
  followsYou: boolean;
  friend: Exclude<FriendState, "blocked">;
  counts: { followers: number; following: number } | null;
  stats: ProfileStats | "hidden" | null;
  online: boolean | null;
}

export interface FollowEntry {
  profile: Profile;
  since: Date;
  followsBack: boolean;
}

/** Your numbers and privacy switches (from GET /me). */
export interface FollowSettings {
  followers: number;
  following: number;
  privateAccount: boolean;
  hideStats: boolean;
}
```

- [ ] **Step 4: Mappers**

In `src/lib/api/mappers.ts`, extend the type import from `../models` with `FollowEntry, FollowSettings, FollowState, FriendState, ProfileTier, ProfileView`. Then append:
```ts
const TIERS: ProfileTier[] = ["self", "matched", "following", "friends"];
const FRIEND_STATES: Exclude<FriendState, "blocked">[] = ["none", "requested", "incoming", "friends"];

export const followState = (v: unknown): FollowState => (v === "following" || v === "requested" ? v : "none");

export function profileView(m: Json): ProfileView {
  const rel = asMap(m.rel);
  const counts = m.counts && typeof m.counts === "object" ? asMap(m.counts) : null;
  const stats = m.stats;
  return {
    profile: profile(asMap(m.profile)),
    tier: TIERS.find((x) => x === m.tier) ?? "matched",
    follow: followState(rel.follow),
    followsYou: bool(rel.followsYou),
    friend: FRIEND_STATES.find((x) => x === rel.friend) ?? "none",
    counts: counts ? { followers: int(counts.followers), following: int(counts.following) } : null,
    stats: stats === "hidden" ? "hidden" : stats && typeof stats === "object" ? { matches: int(asMap(stats).matches), likes: int(asMap(stats).likes), gifts: int(asMap(stats).gifts) } : null,
    online: typeof m.online === "boolean" ? m.online : null,
  };
}

export const followEntry = (m: Json): FollowEntry => ({ profile: profile(asMap(m.profile)), since: date(m.since) ?? new Date(), followsBack: bool(m.followsBack) });

/** The follow part of GET/PATCH /me. */
export const followSettings = (m: Json): FollowSettings => ({ followers: int(m.followers), following: int(m.following), privateAccount: bool(m.privateAccount), hideStats: bool(m.hideStats) });
```

- [ ] **Step 5: Events**

In `src/lib/api/realtime.ts`, in `Ev`, after `friendRemoved`:
```ts
  followNew: "social:follow-new",
  followRequest: "social:follow-request",
  followAccepted: "social:follow-accepted",
  followRemoved: "social:follow-removed",
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/lib/__tests__/follows.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: The store**

Create `src/stores/follows.ts`:
```ts
import { create } from "zustand";

import { ApiError } from "@/lib/api/errors";
import { asList, asMap, followEntry, followSettings, followState, profile as mapProfile, profileView } from "@/lib/api/mappers";
import { Ev } from "@/lib/api/realtime";
import type { FollowEntry, FollowList, FollowSettings, FollowState, ProfileView, ReportReason } from "@/lib/models";

import { api, realtime } from "./services";
import { toast } from "./ui";

/**
 * One-way follows and the tiered profile view (mirror of the Flutter
 * `FollowsProvider`). Following never unlocks chat — that stays with friends.
 */
interface FollowsState {
  settings: FollowSettings;
  /** What we last heard about your follow towards each person. */
  states: Record<string, FollowState>;

  load: () => Promise<void>;
  /** Null when the profile can't be shown (never met, blocked, gone). */
  view: (userId: string) => Promise<ProfileView | null>;
  /** Follows, or sends a request to a private account. */
  follow: (userId: string) => Promise<FollowState>;
  /** Unfollows, or takes back a request. */
  unfollow: (userId: string) => Promise<void>;
  list: (which: FollowList, cursor?: string | null) => Promise<{ items: FollowEntry[]; nextCursor: string | null }>;
  accept: (userId: string) => Promise<void>;
  decline: (userId: string) => Promise<void>;
  removeFollower: (userId: string) => Promise<void>;
  report: (userId: string, choice: { reason: ReportReason; note?: string; block: boolean }) => Promise<void>;
  /** False when it could not be saved (the switch flips back). */
  setPrivacy: (patch: Partial<Pick<FollowSettings, "privateAccount" | "hideStats">>) => Promise<boolean>;
  reset: () => void;
}

const EMPTY: FollowSettings = { followers: 0, following: 0, privateAccount: false, hideStats: false };
const REASON_API: Record<ReportReason, string> = { nudity: "NUDITY", harassment: "HARASSMENT", underage: "UNDERAGE", spam: "SPAM", scam: "SCAM", other: "OTHER" };
const LIST_PATH: Record<FollowList, string> = { followers: "/me/followers", following: "/me/following", requests: "/me/follow-requests" };

export const useFollows = create<FollowsState>()((set, get) => {
  const reloadSettings = async () => {
    try {
      set({ settings: followSettings(asMap(await api.get("/me"))) });
    } catch {}
  };
  const remember = (userId: string, state: FollowState) => set((s) => ({ states: { ...s.states, [userId]: state } }));

  return {
    settings: EMPTY,
    states: {},

    async load() {
      if (!api.hasSession) return;
      await reloadSettings();
    },

    async view(userId) {
      try {
        const v = profileView(asMap(await api.get(`/users/${userId}/view`)));
        remember(userId, v.follow);
        return v;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },

    async follow(userId) {
      const state = followState(asMap(await api.post(`/follows/${userId}`)).state);
      remember(userId, state);
      void reloadSettings();
      return state;
    },

    async unfollow(userId) {
      await api.delete(`/follows/${userId}`);
      remember(userId, "none");
      void reloadSettings();
    },

    async list(which, cursor) {
      const r = asMap(await api.get(LIST_PATH[which], { limit: 50, ...(cursor ? { cursor } : {}) }));
      return { items: asList(r.items).map((e) => followEntry(asMap(e))), nextCursor: typeof r.nextCursor === "string" ? r.nextCursor : null };
    },

    async accept(userId) {
      await api.post(`/me/follow-requests/${userId}/accept`);
      void reloadSettings();
    },

    async decline(userId) {
      await api.post(`/me/follow-requests/${userId}/decline`);
    },

    async removeFollower(userId) {
      await api.delete(`/me/followers/${userId}`);
      void reloadSettings();
    },

    async report(userId, choice) {
      await api.post("/reports", { userId, reason: REASON_API[choice.reason], ...(choice.note ? { note: choice.note } : {}), block: choice.block });
    },

    async setPrivacy(patch) {
      const before = get().settings;
      set({ settings: { ...before, ...patch } });
      try {
        set({ settings: followSettings(asMap(await api.patch("/me", patch))) });
        return true;
      } catch {
        set({ settings: before });
        return false;
      }
    },

    reset() {
      set({ settings: EMPTY, states: {} });
    },
  };
});

export const followStateOf = (s: Pick<FollowsState, "states">, userId: string): FollowState => s.states[userId] ?? "none";

const reload = () => void useFollows.getState().load();
const nameOf = (v: unknown) => mapProfile(asMap(v)).name || "Someone";
realtime.on(Ev.followNew, (d) => {
  toast(`${nameOf(d.from)} started following you`);
  reload();
});
realtime.on(Ev.followRequest, (d) => {
  toast(`${nameOf(d.from)} wants to follow you`);
  reload();
});
realtime.on(Ev.followAccepted, (d) => {
  const p = mapProfile(asMap(d.by));
  useFollows.setState((s) => ({ states: { ...s.states, [p.id]: "following" } }));
  toast(`${p.name || "Someone"} accepted your follow request`);
  reload();
});
realtime.on(Ev.followRemoved, reload);
```

- [ ] **Step 8: Load and reset with the session**

In `src/stores/runtime.ts`:
- Add `import { useFollows } from "./follows";`.
- In `loadAll()`, add `useFollows.getState().load()` to the `Promise.allSettled([...])` list.
- In the sign-out branch, next to `useSocial.getState().reset();`, add `useFollows.getState().reset();`.

- [ ] **Step 9: Checks + commit**

```bash
npm run lint && npm run typecheck && npm test
git add src/lib src/stores
git commit -m "feat(web): follow types, mappers and store"
```
Expected: all green.

---

### Task 12: Web profile screen, sheet, follow pill, `/u/[id]`

**Files:**
- Create: `src/features/profile/user-profile.tsx`
- Create: `src/app/(app)/u/[id]/page.tsx`

**Interfaces:**
- Consumes: `useFollows`, `followStateOf` (Task 11); `useSocial`, `friendStateOf`; `useWallet`, `freeFriendRequestsLeft`; `economy()`; `confirm`, `useNeedCoins`, `pickReport`; UI components (`Avatar`, `GhostButton`, `GradientButton`, `GlassPill`, `Icon`, `MenuButton`, `EmptyState`, `Tag`, `AppBar`, `Panel`, `Spinner`, `SectionTitle`, `Screen`).
- Produces:
  - `UserProfileBody({ userId, inCall?, onGone? })`
  - `UserProfileScreen({ userId })`
  - `openUserProfileSheet(userId, { inCall? })`
  - `FollowPill({ userId })`

- [ ] **Step 1: The component**

Create `src/features/profile/user-profile.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Screen } from "@/components/layout/screen";
import { confirm, useNeedCoins } from "@/components/shared/dialogs";
import { pickReport } from "@/components/shared/report-sheet";
import { Avatar } from "@/components/ui/avatar";
import { GhostButton, GradientButton } from "@/components/ui/button";
import { GlassPill } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { MenuButton, type MenuItem } from "@/components/ui/menu";
import { EmptyState, Tag } from "@/components/ui/misc";
import { AppBar } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Spinner } from "@/components/ui/spinner";
import { SectionTitle } from "@/components/ui/typography";
import { errorMessage } from "@/lib/api/errors";
import { thousands } from "@/lib/format";
import type { FollowState, FriendState, ProfileView } from "@/lib/models";
import { economy } from "@/stores/catalog";
import { followStateOf, useFollows } from "@/stores/follows";
import { friendStateOf, useSocial } from "@/stores/social";
import { openSheet, toast } from "@/stores/ui";
import { freeFriendRequestsLeft, useWallet } from "@/stores/wallet";

/**
 * Someone else's profile. It opens up as you get closer: matched → following
 * (counts, stats) → friends (online, Message). Mirror of the Flutter
 * `UserProfileBody`.
 */
export function UserProfileBody({ userId, inCall = false, onGone }: { userId: string; inCall?: boolean; onGone?: () => void }) {
  const router = useRouter();
  const needCoins = useNeedCoins();
  const follow = useFollows((s) => followStateOf(s, userId));
  const friend = useSocial((s) => friendStateOf(s, userId));
  /** undefined = loading, null = may not see it. */
  const [view, setView] = useState<ProfileView | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setView(await useFollows.getState().view(userId));
    } catch (e) {
      toast(errorMessage(e), { error: true });
      setView(null);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (view === undefined)
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  if (view === null) return <EmptyState icon="person_off" title="Profile not available" body="You can see the profiles of people you have met in a match." className="py-10" />;

  const p = view.profile;
  const self = view.tier === "self";

  /** Runs an action, then re-reads the profile (the tier may have changed). */
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await load();
    } catch (e) {
      toast(errorMessage(e), { error: true });
    } finally {
      setBusy(false);
    }
  };

  const onFollow = () =>
    run(async () => {
      if ((await useFollows.getState().follow(userId)) === "requested") toast("Request sent. They have a private account.");
    });

  const onUnfollow = async () => {
    const pending = follow === "requested";
    const ok = await confirm({ title: pending ? "Cancel your request?" : `Unfollow ${p.name}?`, ok: pending ? "Cancel request" : "Unfollow", cancel: "Keep", okTone: "bad" });
    if (ok) await run(() => useFollows.getState().unfollow(userId));
  };

  const onFriend = async () => {
    if (friend === "friends") {
      if (!inCall) router.push(`/chats/${userId}`);
      return;
    }
    if (friend === "incoming") return run(() => useSocial.getState().accept(userId));
    if (friend !== "none") return;
    const e = economy();
    if (freeFriendRequestsLeft(useWallet.getState()) === 0) {
      const ok = await confirm({ title: "Send a friend request?", body: `Your ${e.freeFriendRequestsPerDay} free requests for today are used. This one costs ${e.friendRequestCost} coins.`, ok: `Send for ${e.friendRequestCost}` });
      if (!ok) return;
    }
    await run(async () => {
      if (await useSocial.getState().sendRequest(p)) toast("Request sent");
      else await needCoins(`A friend request costs ${e.friendRequestCost} coins once your free ones are used.`);
    });
  };

  const onReport = async () => {
    const choice = await pickReport(p.name);
    if (!choice) return;
    await run(() => useFollows.getState().report(userId, choice));
    toast(`Thanks. ${p.name} was reported${choice.block ? " and blocked" : ""}.`);
    if (choice.block) {
      await useSocial.getState().load();
      onGone?.();
    }
  };

  const onBlock = async () => {
    const ok = await confirm({ title: `Block ${p.name}?`, body: "You will never match again, and they can't see your profile.", ok: "Block", okTone: "bad" });
    if (!ok) return;
    await run(() => useSocial.getState().block(p));
    onGone?.();
  };

  const menu: MenuItem[] = [
    ...(view.followsYou ? [{ label: "Remove follower", onSelect: () => void run(() => useFollows.getState().removeFollower(userId)) }] : []),
    ...(friend === "friends" ? [{ label: "Unfriend", onSelect: () => void run(() => useSocial.getState().remove(userId)) }] : []),
    { label: "Report", onSelect: () => void onReport() },
    { label: "Block", tone: "bad", onSelect: () => void onBlock() },
  ];

  return (
    <div>
      <div className="flex items-start">
        <span className="relative shrink-0">
          <Avatar url={p.avatarUrl} name={p.name} size={84} ring />
          {view.online ? <span className="absolute right-0.5 bottom-0.5 size-[18px] rounded-full border-[3px] border-bg bg-ok" /> : null}
        </span>
        <span className="ml-4 min-w-0 flex-1 pt-2">
          <span className="flex items-center">
            <span className="type-display truncate text-[26px] leading-[1.1]">
              {p.name}, {p.age}
            </span>
            {p.verified ? <Icon name="verified" size={20} className="ml-1.5 text-trust" label="Verified" /> : null}
            {p.vip ? <Icon name="workspace_premium" size={19} className="ml-1 text-gold" label="VIP" /> : null}
          </span>
          <span className="type-body mt-1 block text-[13px] text-text2">
            {p.country.flag} {p.country.name}
            {view.online ? " · Online now" : ""}
          </span>
          {view.followsYou ? (
            <span className="mt-2 inline-block">
              <Tag text="Follows you" tone="violet" />
            </span>
          ) : null}
        </span>
        {!self ? <MenuButton label="More" items={menu} /> : null}
      </div>

      {!self ? (
        <div className="mt-[18px] flex gap-2.5">
          <span className="flex-1">
            <FollowButton state={follow} busy={busy} onFollow={() => void onFollow()} onUndo={() => void onUnfollow()} />
          </span>
          <span className="flex-1">
            <FriendButton state={friend} inCall={inCall} onClick={() => void onFriend()} />
          </span>
        </div>
      ) : null}

      {view.counts ? (
        <p className="type-body mt-4 text-[13.5px] text-text2">
          <span className="type-number text-[15px] font-semibold text-text">{thousands(view.counts.followers)}</span> {view.counts.followers === 1 ? "follower" : "followers"}
          <span className="mx-2 text-muted">·</span>
          <span className="type-number text-[15px] font-semibold text-text">{thousands(view.counts.following)}</span> following
        </p>
      ) : null}

      <div className="mt-4">
        <StatsBlock view={view} />
      </div>

      {p.bio.trim() ? (
        <>
          <SectionTitle text="About" top={22} bottom={8} />
          <p className="type-body text-[14.5px] text-text">{p.bio}</p>
        </>
      ) : null}
      {p.interests.length ? (
        <>
          <SectionTitle text="Interests" top={22} bottom={10} />
          <div className="flex flex-wrap gap-1.5">
            {p.interests.map((i) => (
              <Tag key={i} text={i} tone="violet" />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function FollowButton({ state, busy, onFollow, onUndo }: { state: FollowState; busy: boolean; onFollow: () => void; onUndo: () => void }) {
  if (state === "none") return <GradientButton label="Follow" icon="person_add_alt_1" height={46} busy={busy} onClick={onFollow} />;
  return <GhostButton label={state === "requested" ? "Requested" : "Following"} icon={state === "requested" ? "hourglass_top" : "check"} height={46} expand disabled={busy} onClick={onUndo} />;
}

function FriendButton({ state, inCall, onClick }: { state: FriendState; inCall: boolean; onClick: () => void }) {
  if (state === "friends") return <GhostButton label="Message" icon="chat_bubble_outline" height={46} expand disabled={inCall} onClick={onClick} />;
  if (state === "incoming") return <GhostButton label="Accept friend" icon="how_to_reg" height={46} expand onClick={onClick} />;
  if (state === "requested") return <GhostButton label="Request sent" icon="hourglass_top" height={46} expand disabled />;
  if (state === "blocked") return null;
  return <GhostButton label="Add friend" icon="person_add" height={46} expand onClick={onClick} />;
}

/** Matches · Likes · Gifts, or why you can't see them. */
function StatsBlock({ view }: { view: ProfileView }) {
  const s = view.stats;
  if (s && s !== "hidden") {
    const cell = (n: number, label: string) => (
      <span className="flex flex-1 flex-col items-center">
        <span className="type-number text-[20px]">{thousands(n)}</span>
        <span className="type-body mt-0.5 text-[11px] leading-[1.2] text-muted">{label}</span>
      </span>
    );
    return (
      <Panel className="py-4">
        <div className="flex">
          {cell(s.matches, "Matches")}
          {cell(s.likes, "Likes")}
          {cell(s.gifts, "Gifts")}
        </div>
      </Panel>
    );
  }
  const hidden = s === "hidden";
  return (
    <Panel className="px-4 py-[18px]">
      <div className="flex items-center gap-2.5">
        <Icon name={hidden ? "visibility_off" : "lock"} size={18} className="text-muted" />
        <span className="type-body text-[13px] text-text2">{hidden ? "Stats hidden" : "Follow to see their stats"}</span>
      </div>
    </Panel>
  );
}

/** The page at /u/[id]. */
export function UserProfileScreen({ userId }: { userId: string }) {
  const router = useRouter();
  const back = () => (window.history.length > 1 ? router.back() : router.push("/me"));
  return (
    <Screen header={<AppBar onBack={back} />}>
      <div className="pt-2">
        <UserProfileBody userId={userId} onGone={back} />
      </div>
    </Screen>
  );
}

/** Opens a profile over whatever is on screen — used in a live call, so the call keeps going. */
export const openUserProfileSheet = (userId: string, opts: { inCall?: boolean } = {}) =>
  openSheet<void>((close) => (
    <div className="px-5 pt-2 pb-5">
      <UserProfileBody userId={userId} inCall={opts.inCall} onGone={() => close()} />
    </div>
  ));

/** Follow from the call's top bar. Reads the partner's profile once to know the current state. */
export function FollowPill({ userId }: { userId: string }) {
  const state = useFollows((s) => followStateOf(s, userId));
  useEffect(() => {
    useFollows
      .getState()
      .view(userId)
      .catch(() => {});
  }, [userId]);
  const label = state === "following" ? "Following" : state === "requested" ? "Requested" : "Follow";
  const icon = state === "following" ? "check" : state === "requested" ? "hourglass_top" : "person_add_alt_1";
  const follow = () => {
    useFollows
      .getState()
      .follow(userId)
      .catch((e: unknown) => toast(errorMessage(e), { error: true }));
  };
  return <GlassPill label={label} icon={icon} tint={state === "none" ? "violet" : undefined} height={36} className="shrink-0" onClick={state === "none" ? follow : undefined} />;
}
```

- [ ] **Step 2: The route**

Create `src/app/(app)/u/[id]/page.tsx`:
```tsx
import { UserProfileScreen } from "@/features/profile/user-profile";

export const metadata = { title: "Profile" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UserProfileScreen userId={id} />;
}
```

- [ ] **Step 3: Checks**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all green. If lint flags `react-hooks/rules-of-hooks` for the handlers defined after the early returns, that's a false alarm: they are plain functions, not hooks. If it flags `set-state-in-effect`, the `load()` call is asynchronous (state is set after `await`), which matches how the other screens load.

- [ ] **Step 4: Commit**

```bash
git add src/features/profile/user-profile.tsx "src/app/(app)/u"
git commit -m "feat(web): user profile page and sheet with tiers"
```

---

### Task 13: Web entry points and follower lists

**Files:**
- Create: `src/features/profile/follow-lists-screen.tsx`
- Create: `src/app/(app)/me/follows/page.tsx`
- Modify: `src/features/profile/me-screen.tsx` (imports; after `StatsCard`; `MatchRow`; new `FollowSection`)
- Modify: `src/features/match/connected.tsx` (imports; identity pill; Follow pill)
- Modify: `src/features/match/ended.tsx` (imports; "View profile")
- Modify: `src/features/chats/chat-view.tsx` (AppBar children)

**Interfaces:**
- Consumes: Task 11 store; Task 12 `openUserProfileSheet`, `FollowPill`.
- Produces: `FollowListsScreen({ initialTab: FollowList })` at `/me/follows?tab=followers|following|requests`.

- [ ] **Step 1: Lists screen**

Create `src/features/profile/follow-lists-screen.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Screen } from "@/components/layout/screen";
import { confirm } from "@/components/shared/dialogs";
import { Avatar } from "@/components/ui/avatar";
import { GhostButton, GradientButton, TextButton } from "@/components/ui/button";
import { MenuButton } from "@/components/ui/menu";
import { EmptyState } from "@/components/ui/misc";
import { AppBar } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { ago } from "@/lib/format";
import type { FollowEntry, FollowList } from "@/lib/models";
import { useFollows } from "@/stores/follows";
import { toast } from "@/stores/ui";

const LABEL: Record<FollowList, string> = { followers: "Followers", following: "Following", requests: "Requests" };
const EMPTY: Record<FollowList, { icon: string; title: string; body: string }> = {
  followers: { icon: "group", title: "No followers yet", body: "People you meet can follow you from your profile." },
  following: { icon: "person_search", title: "You don't follow anyone", body: "Tap Follow on someone's profile after a match." },
  requests: { icon: "inbox", title: "No requests", body: "While your account is private, new followers wait here." },
};

/** Your followers, who you follow, and (private accounts) waiting requests. Only you see these. */
export function FollowListsScreen({ initialTab }: { initialTab: FollowList }) {
  const router = useRouter();
  const isPrivate = useFollows((s) => s.settings.privateAccount);
  const tabs: FollowList[] = isPrivate ? ["followers", "following", "requests"] : ["followers", "following"];
  const [tab, setTab] = useState<FollowList>(initialTab);
  const shown = tabs.includes(tab) ? tab : "followers";
  return (
    <Screen header={<AppBar title="Followers" onBack={() => router.push("/me")} />}>
      <div role="tablist" className="mb-2 flex gap-1 border-b border-line-soft">
        {tabs.map((x) => (
          <button
            key={x}
            role="tab"
            type="button"
            aria-selected={shown === x}
            onClick={() => setTab(x)}
            className={cn("type-label -mb-px border-b-2 px-3 py-2.5 text-[14px] font-medium", shown === x ? "border-pink text-text" : "border-transparent text-muted hover:text-text2")}
          >
            {LABEL[x]}
          </button>
        ))}
      </div>
      <FollowListTab key={shown} which={shown} />
    </Screen>
  );
}

function FollowListTab({ which }: { which: FollowList }) {
  const router = useRouter();
  const [items, setItems] = useState<FollowEntry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [followedBack, setFollowedBack] = useState<string[]>([]);

  const more = useCallback(
    async (from: string | null) => {
      try {
        const page = await useFollows.getState().list(which, from);
        setItems((prev) => [...(from ? (prev ?? []) : []), ...page.items]);
        setCursor(page.nextCursor);
      } catch (e) {
        toast(errorMessage(e), { error: true });
        setItems((prev) => prev ?? []);
      } finally {
        setFetching(false);
      }
    },
    [which],
  );

  useEffect(() => {
    void more(null);
  }, [more]);

  const drop = (id: string) => setItems((prev) => (prev ?? []).filter((x) => x.profile.id !== id));
  const act = async (action: () => Promise<unknown>, after?: () => void) => {
    try {
      await action();
      after?.();
    } catch (e) {
      toast(errorMessage(e), { error: true });
    }
  };
  const unfollow = async (e: FollowEntry) => {
    if (await confirm({ title: `Unfollow ${e.profile.name}?`, ok: "Unfollow", cancel: "Keep", okTone: "bad" })) await act(() => useFollows.getState().unfollow(e.profile.id), () => drop(e.profile.id));
  };

  if (items === null)
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  if (!items.length) {
    const e = EMPTY[which];
    return <EmptyState icon={e.icon} title={e.title} body={e.body} className="py-10" />;
  }

  const actions = (e: FollowEntry) => {
    const id = e.profile.id;
    if (which === "requests")
      return (
        <span className="ml-2 flex shrink-0 items-center gap-1">
          <TextButton onClick={() => void act(() => useFollows.getState().decline(id), () => drop(id))}>Decline</TextButton>
          <GradientButton label="Accept" height={36} expand={false} onClick={() => void act(() => useFollows.getState().accept(id), () => drop(id))} />
        </span>
      );
    if (which === "following") return <GhostButton label="Following" height={34} className="ml-2 shrink-0" onClick={() => void unfollow(e)} />;
    return (
      <span className="ml-2 flex shrink-0 items-center gap-1">
        {!e.followsBack && !followedBack.includes(id) ? (
          <GhostButton label="Follow back" height={34} onClick={() => void act(() => useFollows.getState().follow(id), () => setFollowedBack((x) => [...x, id]))} />
        ) : null}
        <MenuButton label="More" items={[{ label: "Remove follower", tone: "bad", onSelect: () => void act(() => useFollows.getState().removeFollower(id), () => drop(id)) }]} />
      </span>
    );
  };

  return (
    <div>
      {items.map((e) => (
        <div key={e.profile.id} className="flex items-center border-b border-line-soft py-3">
          <button type="button" className="flex min-w-0 flex-1 items-center text-left" onClick={() => router.push(`/u/${e.profile.id}`)}>
            <Avatar url={e.profile.avatarUrl} name={e.profile.name} size={44} />
            <span className="ml-3.5 min-w-0">
              <span className="type-title block truncate text-[15px] font-semibold">
                {e.profile.name}, {e.profile.age} {e.profile.country.flag}
              </span>
              <span className="type-body block text-[12px] text-text2">{ago(e.since)}</span>
            </span>
          </button>
          {actions(e)}
        </div>
      ))}
      {cursor ? (
        <div className="mt-4 flex justify-center">
          <GhostButton
            label={fetching ? "Loading…" : "Show more"}
            disabled={fetching}
            onClick={() => {
              setFetching(true);
              void more(cursor);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
```
Create `src/app/(app)/me/follows/page.tsx`:
```tsx
import { FollowListsScreen } from "@/features/profile/follow-lists-screen";
import type { FollowList } from "@/lib/models";

export const metadata = { title: "Followers" };

const TABS: FollowList[] = ["followers", "following", "requests"];

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <FollowListsScreen initialTab={TABS.find((x) => x === tab) ?? "followers"} />;
}
```

- [ ] **Step 2: Me screen**

In `src/features/profile/me-screen.tsx` add `import { useFollows } from "@/stores/follows";`. Replace
```tsx
      <div className="mt-3">
        <StatsCard me={me} />
      </div>
```
with
```tsx
      <div className="mt-3">
        <StatsCard me={me} />
      </div>
      <FollowSection />
```
In `MatchRow`, replace the outer `<div className={`flex items-center py-3 ${last ? "" : "border-b border-line-soft"}`}>` with
```tsx
    <Link href={`/u/${r.partner.id}`} className={`flex items-center py-3 transition-opacity hover:opacity-85 ${last ? "" : "border-b border-line-soft"}`}>
```
and its closing `</div>` with `</Link>`. (`Link` is already imported.) Add at the end of the file:
```tsx
/** Your followers (only you see the lists) and the two privacy switches. */
function FollowSection() {
  const router = useRouter();
  const s = useFollows((x) => x.settings);
  const save = async (patch: { privateAccount?: boolean; hideStats?: boolean }) => {
    if (!(await useFollows.getState().setPrivacy(patch))) toast("Couldn't save that, try again", { error: true });
  };
  return (
    <div className="mt-2.5">
      <GroupCard dividerInset={52}>
        <GroupRow
          bare
          icon="people_alt"
          title={`${thousands(s.followers)} ${s.followers === 1 ? "follower" : "followers"} · ${thousands(s.following)} following`}
          subtitle="Only you can see these lists."
          trailing={<Icon name="chevron_right" className="text-muted" />}
          onClick={() => router.push("/me/follows")}
        />
        <GroupRow
          bare
          icon="lock"
          iconVariant="outlined"
          title="Private account"
          subtitle="New followers need your OK first."
          trailing={<Switch checked={s.privateAccount} label="Private account" onChange={(on) => void save({ privateAccount: on })} />}
        />
        <GroupRow
          bare
          icon="visibility_off"
          iconVariant="outlined"
          title="Hide my stats"
          subtitle="Matches, likes and gifts stay private."
          trailing={<Switch checked={s.hideStats} label="Hide my stats" onChange={(on) => void save({ hideStats: on })} />}
        />
      </GroupCard>
    </div>
  );
}
```

- [ ] **Step 3: Live call**

In `src/features/match/connected.tsx` add `import { FollowPill, openUserProfileSheet } from "@/features/profile/user-profile";`.
Wrap the identity pill. Replace
```tsx
        <Glass radius={24} className="flex min-w-0 shrink items-center bg-bg2/45 py-[5px] pr-3.5 pl-[5px]">
```
with
```tsx
        <button type="button" aria-label={`Open ${p.name}'s profile`} onClick={() => void openUserProfileSheet(p.id, { inCall: true })} className="flex min-w-0 shrink text-left">
        <Glass radius={24} className="flex min-w-0 shrink items-center bg-bg2/45 py-[5px] pr-3.5 pl-[5px]">
```
and replace
```tsx
        </Glass>
        <Glass radius={16} className="flex h-8 shrink-0 items-center bg-bg2/45 px-2.5 py-0">
```
with
```tsx
        </Glass>
        </button>
        <Glass radius={16} className="flex h-8 shrink-0 items-center bg-bg2/45 px-2.5 py-0">
```
Then add the pill. Replace
```tsx
        <span className="flex-1" />
        <GlassPill label="Report"
```
with
```tsx
        <span className="flex-1" />
        <FollowPill userId={p.id} />
        <GlassPill label="Report"
```

- [ ] **Step 4: Call ended**

In `src/features/match/ended.tsx` add `import { openUserProfileSheet } from "@/features/profile/user-profile";`. Right after
```tsx
              {p.country.flag} {p.country.name} · {p.age}
            </p>
```
add
```tsx
            <TextButton icon="person" className="mt-1 text-[13px] font-medium text-text2" onClick={() => void openUserProfileSheet(p.id)}>
              View profile
            </TextButton>
```

- [ ] **Step 5: Chat header**

In `src/features/chats/chat-view.tsx`, inside `<AppBar …>`, replace
```tsx
        <span className="relative shrink-0">
          <Avatar url={p.avatarUrl} name={p.name} size={40} />
```
with
```tsx
        <button type="button" aria-label={`Open ${p.name}'s profile`} className="flex min-w-0 items-center text-left" onClick={() => router.push(`/u/${friendId}`)}>
        <span className="relative shrink-0">
          <Avatar url={p.avatarUrl} name={p.name} size={40} />
```
and replace
```tsx
        </span>
      </AppBar>
```
with
```tsx
        </span>
        </button>
      </AppBar>
```
(`router` already exists in `ChatView`: `const router = useRouter();`.)

- [ ] **Step 6: Checks + build**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all green; the build lists `/u/[id]` and `/me/follows` as dynamic routes.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat(web): follow from calls, profile entry points, follower lists, privacy switches"
```

---

### Task 14: End-to-end check and docs

**Files:**
- Modify: `apps/vibe/docs/specs/2026-10-05-follow-and-profiles-design.md` (status line)
- Project doc `claude/follow-and-profiles.md` (in the Vibe claude.ai project)

- [ ] **Step 1: Full test runs**

```bash
cd apps/vibe/backend && npm run lint && npm run typecheck && npm test && npm run test:e2e
cd ../app && flutter analyze && flutter test
cd ../web && npm run lint && npm run typecheck && npm test && npm run build
cd ../admin && npm run typecheck && npm run build
```
Expected: all green. Admin is included because the Economy page renders the new rule from `RULE_GROUPS`.

- [ ] **Step 2: Two-person manual check against the local API**

Start the API (`backend: npm run start:dev`) and the web app (`web: npm run dev`). Sign in as user A in a normal window and as user B in a private window. Use dev bots or two real sessions to get matched once.
1. During the call, A taps B's name. The sheet opens, the video keeps playing, and it shows the **matched** tier with "Follow to see their stats".
2. A taps **Follow** in the top bar. B sees the toast "A started following you". A's sheet now shows counts and stats.
3. B goes to Me → Private account ON. A unfollows, then follows again and sees "Requested". B opens Followers → Requests → Accept.
4. B turns on Hide my stats. A's view of B shows "Stats hidden".
5. A and B become friends. A sees **Online now** and **Message**. A follower who isn't a friend can't send messages (chat stays locked).
6. B blocks A. A's `/u/<B>` shows "Profile not available".
7. Admin → Economy → "Friends, follows and boosts" shows **Follows per day = 200**.

- [ ] **Step 3: Docs**

Set the spec's status line to `Status: built (Oct 2026).`. In the Vibe project doc `claude/follow-and-profiles.md`, replace "Next" with a "Built" section listing:
- the test counts from Step 1
- the 6 plan deviations (top of this plan)
- that the phone check (vivo) is still to do

- [ ] **Step 4: Commit**

```bash
git add docs/specs/2026-10-05-follow-and-profiles-design.md
git commit -m "docs: follow + profiles built"
```

---

## As built (2026-10-05)

All 14 tasks done. Changes from the plan, found while building:
- **App profile screen** loads after the first frame (`addPostFrameCallback`), because a fast answer notified listeners mid-build (caught by the widget test).
- **In-call Follow control** (app + web) is a compact "+" icon button with tooltip/label, not a text pill: on a 412-px phone the text pill squeezed the partner's name to "Mi…". It shows a check once following, an hourglass while requested. The "+" (not a person icon) keeps it distinct from the bottom "Add" friend button.
- **Web** profile/lists load through a promise inside `useEffect` and re-read via a version counter (React's `set-state-in-effect` lint rule rejects calling a state-setting loader from an effect).
- `test_shots/shots_test.dart` harness now provides `FollowsProvider`. (Its HomeShell shots were already failing before this work because the harness never provides `AppServices`.)

Verified: backend lint/typecheck, 80 unit + 123 e2e (11 new in `test/follows.e2e-spec.ts`); app analyze (4 pre-existing issues), 91 tests (12 new); web lint/typecheck, 23 tests (4 new), production build; app screens rendered and checked; web checked in a headless browser against the real API with two users (locked stats → follow → counts/stats → follower list → follow back → "Follows you").
Not yet checked: on a physical phone; push notifications on a real device.
