-- CreateEnum
CREATE TYPE "FollowStatus" AS ENUM ('PENDING', 'ACTIVE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "followersCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "followingCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "giftsReceivedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hideStats" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "privateAccount" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followeeId" TEXT NOT NULL,
    "status" "FollowStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Follow_followeeId_status_createdAt_idx" ON "Follow"("followeeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Follow_followerId_status_createdAt_idx" ON "Follow"("followerId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerId_followeeId_key" ON "Follow"("followerId", "followeeId");

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followeeId_fkey" FOREIGN KEY ("followeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: integrity and backfill.
ALTER TABLE "Follow" ADD CONSTRAINT "follow_distinct_users" CHECK ("followerId" <> "followeeId");
ALTER TABLE "User" ADD CONSTRAINT "user_social_counts_non_negative" CHECK ("followersCount" >= 0 AND "followingCount" >= 0 AND "giftsReceivedCount" >= 0);
UPDATE "User" u SET "giftsReceivedCount" = g.n
  FROM (SELECT "toId", COUNT(*)::int AS n FROM "GiftTransfer" GROUP BY "toId") g
 WHERE g."toId" = u."id";
