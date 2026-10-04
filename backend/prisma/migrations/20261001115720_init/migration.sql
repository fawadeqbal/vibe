-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DELETED');

-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('PURCHASE', 'SPEND', 'EARN', 'GIFT_SENT', 'GIFT_RECEIVED', 'CASHOUT', 'CASHOUT_REVERSAL', 'VIP', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('GOOGLE_PLAY', 'APP_STORE', 'JAZZCASH', 'EASYPAISA', 'CARD', 'BANK');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('COIN_PACK', 'VIP_PLAN');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CashoutStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "MatchEndReason" AS ENUM ('SKIPPED', 'LEFT', 'STOPPED', 'REPORTED', 'BLOCKED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('NUDITY', 'HARASSMENT', 'UNDERAGE', 'SPAM', 'SCAM', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'ACTIONED', 'DISMISSED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "phone" TEXT,
    "googleSub" TEXT,
    "appleSub" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "age" INTEGER,
    "gender" "Gender" NOT NULL DEFAULT 'OTHER',
    "countryCode" VARCHAR(2) NOT NULL DEFAULT 'PK',
    "avatarUrl" TEXT NOT NULL DEFAULT '',
    "bio" VARCHAR(160) NOT NULL DEFAULT '',
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "onboardedAt" TIMESTAMP(3),
    "bannedUntil" TIMESTAMP(3),
    "inviteCode" TEXT NOT NULL,
    "invitedById" TEXT,
    "inviteRewardedAt" TIMESTAMP(3),
    "matchesCount" INTEGER NOT NULL DEFAULT 0,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "userId" TEXT NOT NULL,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "gems" INTEGER NOT NULL DEFAULT 0,
    "vipUntil" TIMESTAMP(3),
    "boostUntil" TIMESTAMP(3),
    "streakDay" INTEGER NOT NULL DEFAULT 0,
    "lastCheckInAt" TIMESTAMP(3),
    "adsDay" DATE,
    "adsWatchedToday" INTEGER NOT NULL DEFAULT 0,
    "friendRequestsDay" DATE,
    "freeFriendRequestsToday" INTEGER NOT NULL DEFAULT 0,
    "profileBonusClaimed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "title" TEXT NOT NULL,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "gems" INTEGER NOT NULL DEFAULT 0,
    "usdCents" INTEGER NOT NULL DEFAULT 0,
    "method" "PaymentMethod",
    "reference" TEXT,
    "balanceCoins" INTEGER NOT NULL,
    "balanceGems" INTEGER NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productType" "ProductType" NOT NULL,
    "productId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "usdCents" INTEGER NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "providerRef" TEXT,
    "nextAction" TEXT,
    "failureReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "lastBonusAt" TIMESTAMP(3),
    "purchaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cashout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gems" INTEGER NOT NULL,
    "usdCents" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "accountMasked" TEXT NOT NULL,
    "status" "CashoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "providerRef" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "Cashout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endedById" TEXT,
    "endReason" "MatchEndReason",
    "coinsSpentA" INTEGER NOT NULL DEFAULT 0,
    "coinsSpentB" INTEGER NOT NULL DEFAULT 0,
    "reconnect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchLike" (
    "matchId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchLike_pkey" PRIMARY KEY ("matchId","fromId")
);

-- CreateTable
CREATE TABLE "GiftTransfer" (
    "id" TEXT NOT NULL,
    "giftId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "coins" INTEGER NOT NULL,
    "gems" INTEGER NOT NULL,
    "matchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "userLowId" TEXT NOT NULL,
    "userHighId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "friendshipId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "text" VARCHAR(1000) NOT NULL,
    "giftId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedId" TEXT NOT NULL,
    "matchId" TEXT,
    "reason" "ReportReason" NOT NULL,
    "note" VARCHAR(500),
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- CreateIndex
CREATE UNIQUE INDEX "User_appleSub_key" ON "User"("appleSub");

-- CreateIndex
CREATE UNIQUE INDEX "User_inviteCode_key" ON "User"("inviteCode");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshHash_key" ON "Session"("refreshHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_family_idx" ON "Session"("family");

-- CreateIndex
CREATE INDEX "LedgerEntry_userId_createdAt_idx" ON "LedgerEntry"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_userId_idempotencyKey_key" ON "LedgerEntry"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Purchase_userId_createdAt_idx" ON "Purchase"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_userId_idempotencyKey_key" ON "Purchase"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_method_providerRef_key" ON "Purchase"("method", "providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_purchaseId_key" ON "Subscription"("purchaseId");

-- CreateIndex
CREATE INDEX "Subscription_userId_status_idx" ON "Subscription"("userId", "status");

-- CreateIndex
CREATE INDEX "Subscription_status_currentPeriodEnd_idx" ON "Subscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "Cashout_userId_createdAt_idx" ON "Cashout"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Cashout_status_idx" ON "Cashout"("status");

-- CreateIndex
CREATE INDEX "Match_userAId_startedAt_idx" ON "Match"("userAId", "startedAt");

-- CreateIndex
CREATE INDEX "Match_userBId_startedAt_idx" ON "Match"("userBId", "startedAt");

-- CreateIndex
CREATE INDEX "MatchLike_toId_createdAt_idx" ON "MatchLike"("toId", "createdAt");

-- CreateIndex
CREATE INDEX "GiftTransfer_toId_createdAt_idx" ON "GiftTransfer"("toId", "createdAt");

-- CreateIndex
CREATE INDEX "GiftTransfer_fromId_createdAt_idx" ON "GiftTransfer"("fromId", "createdAt");

-- CreateIndex
CREATE INDEX "Friendship_userLowId_status_idx" ON "Friendship"("userLowId", "status");

-- CreateIndex
CREATE INDEX "Friendship_userHighId_status_idx" ON "Friendship"("userHighId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_userLowId_userHighId_key" ON "Friendship"("userLowId", "userHighId");

-- CreateIndex
CREATE INDEX "Message_friendshipId_createdAt_idx" ON "Message"("friendshipId", "createdAt");

-- CreateIndex
CREATE INDEX "Block_blockedId_idx" ON "Block"("blockedId");

-- CreateIndex
CREATE INDEX "Report_reportedId_createdAt_idx" ON "Report"("reportedId", "createdAt");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_reportedId_matchId_key" ON "Report"("reporterId", "reportedId", "matchId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cashout" ADD CONSTRAINT "Cashout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchLike" ADD CONSTRAINT "MatchLike_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftTransfer" ADD CONSTRAINT "GiftTransfer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_friendshipId_fkey" FOREIGN KEY ("friendshipId") REFERENCES "Friendship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportedId_fkey" FOREIGN KEY ("reportedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Money invariants the ORM cannot express ─────────────────────────────
ALTER TABLE "Wallet" ADD CONSTRAINT "wallet_coins_non_negative" CHECK ("coins" >= 0);
ALTER TABLE "Wallet" ADD CONSTRAINT "wallet_gems_non_negative" CHECK ("gems" >= 0);
ALTER TABLE "Cashout" ADD CONSTRAINT "cashout_gems_positive" CHECK ("gems" > 0);
ALTER TABLE "Friendship" ADD CONSTRAINT "friendship_pair_ordered" CHECK ("userLowId" < "userHighId");
ALTER TABLE "Match" ADD CONSTRAINT "match_distinct_users" CHECK ("userAId" <> "userBId");
