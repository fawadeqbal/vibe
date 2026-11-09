-- Notifications page: friend/follow requests, followers, matches, missed calls, money and account news (kept 90 days).
CREATE TABLE "ActivityItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "actorId" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActivityItem_userId_createdAt_idx" ON "ActivityItem"("userId", "createdAt");
CREATE INDEX "ActivityItem_userId_readAt_idx" ON "ActivityItem"("userId", "readAt");
CREATE INDEX "ActivityItem_createdAt_idx" ON "ActivityItem"("createdAt");
