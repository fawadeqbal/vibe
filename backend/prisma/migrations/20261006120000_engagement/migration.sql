-- Engagement: friend streaks, XP/levels/badges, gem goal, quiet hours, win-back, Moments.

-- AlterTable
ALTER TABLE "Friendship" ADD COLUMN     "streakBest" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "streakCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "streakDay" INTEGER,
ADD COLUMN     "streakHighDay" INTEGER,
ADD COLUMN     "streakLowDay" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bestStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "breakReminderMinutes" INTEGER,
ADD COLUMN     "gemGoal" INTEGER,
ADD COLUMN     "gemGoalReachedFor" INTEGER,
ADD COLUMN     "giftsSentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "goodCallsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nightCallsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "quietHoursEnd" INTEGER,
ADD COLUMN     "quietHoursStart" INTEGER,
ADD COLUMN     "tzOffsetMinutes" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "vibeScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
ADD COLUMN     "winbackAt" TIMESTAMP(3),
ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN     "freeBoosts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Moment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mediaKey" TEXT NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "caption" VARCHAR(120) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Moment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MomentView" (
    "momentId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MomentView_pkey" PRIMARY KEY ("momentId","viewerId")
);

-- CreateIndex
CREATE INDEX "Moment_userId_expiresAt_idx" ON "Moment"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Moment_expiresAt_idx" ON "Moment"("expiresAt");

-- CreateIndex
CREATE INDEX "Friendship_status_streakDay_idx" ON "Friendship"("status", "streakDay");

-- AddForeignKey
ALTER TABLE "Moment" ADD CONSTRAINT "Moment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MomentView" ADD CONSTRAINT "MomentView_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "Moment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A free boost can never go negative (same rule as coins and gems).
ALTER TABLE "Wallet" ADD CONSTRAINT "wallet_free_boosts_non_negative" CHECK ("freeBoosts" >= 0);
