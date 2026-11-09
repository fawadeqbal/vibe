-- Notifications page = every notification in one place. Lines can stand for
-- several (one per chat), and what used to live in Chats moves here.
ALTER TABLE "ActivityItem" ADD COLUMN "collapseKey" VARCHAR(120);
ALTER TABLE "ActivityItem" ADD COLUMN "count" INTEGER NOT NULL DEFAULT 1;
CREATE INDEX "ActivityItem_userId_collapseKey_idx" ON "ActivityItem"("userId", "collapseKey");

-- Friend requests still waiting (they no longer show in Chats).
INSERT INTO "ActivityItem" (id, "userId", type, "actorId", title, body, data, "createdAt")
SELECT gen_random_uuid()::text,
       CASE WHEN f."requesterId" = f."userLowId" THEN f."userHighId" ELSE f."userLowId" END,
       'friend.request', f."requesterId", 'New friend request',
       left(coalesce(nullif(u.name, ''), 'Someone') || ' wants to be friends', 500),
       jsonb_build_object('route', 'friends', 'userId', f."requesterId"),
       f."createdAt"
  FROM "Friendship" f JOIN "User" u ON u.id = f."requesterId"
 WHERE f.status = 'PENDING'
   AND NOT EXISTS (SELECT 1 FROM "ActivityItem" a
                    WHERE a.type = 'friend.request' AND a."actorId" = f."requesterId"
                      AND a."userId" = CASE WHEN f."requesterId" = f."userLowId" THEN f."userHighId" ELSE f."userLowId" END);

-- Follow requests still waiting.
INSERT INTO "ActivityItem" (id, "userId", type, "actorId", title, body, data, "createdAt")
SELECT gen_random_uuid()::text, fo."followeeId", 'follow.request', fo."followerId", 'Follow request',
       left(coalesce(nullif(u.name, ''), 'Someone') || ' wants to follow you', 500),
       jsonb_build_object('route', 'follow-requests', 'userId', fo."followerId"),
       fo."createdAt"
  FROM "Follow" fo JOIN "User" u ON u.id = fo."followerId"
 WHERE fo.status = 'PENDING'
   AND NOT EXISTS (SELECT 1 FROM "ActivityItem" a WHERE a.type = 'follow.request' AND a."actorId" = fo."followerId" AND a."userId" = fo."followeeId");

-- "Messages from Vibe" of the last 90 days (skipping ones the page already has, e.g. "Your account is paused").
INSERT INTO "ActivityItem" (id, "userId", type, title, body, data, "readAt", "createdAt")
SELECT gen_random_uuid()::text, m."userId", 'team.message', left(m.title, 200), left(m.body, 500),
       jsonb_build_object('route', 'inbox'), m."readAt", m."createdAt"
  FROM "UserMessage" m
 WHERE m."createdAt" > now() - interval '90 days'
   AND NOT EXISTS (SELECT 1 FROM "ActivityItem" a
                    WHERE a."userId" = m."userId" AND a.title = left(m.title, 200)
                      AND a."createdAt" BETWEEN m."createdAt" - interval '2 minutes' AND m."createdAt" + interval '2 minutes');
