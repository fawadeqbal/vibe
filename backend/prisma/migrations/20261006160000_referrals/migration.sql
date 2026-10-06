-- Referrals v2 + affiliates (docs/specs/2026-10-06-referrals-affiliates-design.md).
-- Hand-checked: `migrate diff` also proposed dropping the raw trigram search indexes; those lines were removed.

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'QUALIFIED', 'REWARDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AffiliateStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AffiliateCommissionKind" AS ENUM ('REVSHARE', 'CPA');

-- CreateEnum
CREATE TYPE "AffiliateCommissionStatus" AS ENUM ('PENDING', 'AVAILABLE', 'PAID', 'REVERSED', 'HELD');

-- CreateEnum
CREATE TYPE "AffiliatePayoutStatus" AS ENUM ('REQUESTED', 'PAID', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "referralsRewarded" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "signupDeviceHash" TEXT;

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "inviterId" TEXT,
    "affiliateId" TEXT,
    "inviteeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "channel" VARCHAR(24),
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "rejectReason" VARCHAR(120),
    "deviceHash" TEXT,
    "ip" VARCHAR(64),
    "qualifiedAt" TIMESTAMP(3),
    "rewardedAt" TIMESTAMP(3),
    "inviterCoins" INTEGER NOT NULL DEFAULT 0,
    "inviteeCoins" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralClick" (
    "code" TEXT NOT NULL,
    "channel" VARCHAR(24) NOT NULL,
    "day" DATE NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReferralClick_pkey" PRIMARY KEY ("code","channel","day")
);

-- CreateTable
CREATE TABLE "Affiliate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" VARCHAR(40) NOT NULL,
    "status" "AffiliateStatus" NOT NULL DEFAULT 'PENDING',
    "revSharePercent" INTEGER,
    "cpaUsdCents" INTEGER,
    "channels" JSONB NOT NULL DEFAULT '[]',
    "note" VARCHAR(1000) NOT NULL DEFAULT '',
    "staffNote" VARCHAR(2000),
    "decisionReason" VARCHAR(300),
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateCommission" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "kind" "AffiliateCommissionKind" NOT NULL,
    "key" TEXT NOT NULL,
    "baseUsdCents" INTEGER NOT NULL,
    "usdCents" INTEGER NOT NULL,
    "status" "AffiliateCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "availableAt" TIMESTAMP(3) NOT NULL,
    "payoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliatePayout" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "usdCents" INTEGER NOT NULL,
    "amountPkr" INTEGER NOT NULL,
    "payoutAccountId" TEXT,
    "accountMasked" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "AffiliatePayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "reference" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,

    CONSTRAINT "AffiliatePayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Referral_inviteeId_key" ON "Referral"("inviteeId");

-- CreateIndex
CREATE INDEX "Referral_inviterId_createdAt_idx" ON "Referral"("inviterId", "createdAt");

-- CreateIndex
CREATE INDEX "Referral_affiliateId_createdAt_idx" ON "Referral"("affiliateId", "createdAt");

-- CreateIndex
CREATE INDEX "Referral_status_qualifiedAt_idx" ON "Referral"("status", "qualifiedAt");

-- CreateIndex
CREATE INDEX "Referral_deviceHash_createdAt_idx" ON "Referral"("deviceHash", "createdAt");

-- CreateIndex
CREATE INDEX "Referral_createdAt_idx" ON "Referral"("createdAt");

-- CreateIndex
CREATE INDEX "ReferralClick_day_idx" ON "ReferralClick"("day");

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_userId_key" ON "Affiliate"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_code_key" ON "Affiliate"("code");

-- CreateIndex
CREATE INDEX "Affiliate_status_appliedAt_idx" ON "Affiliate"("status", "appliedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateCommission_key_key" ON "AffiliateCommission"("key");

-- CreateIndex
CREATE INDEX "AffiliateCommission_affiliateId_status_idx" ON "AffiliateCommission"("affiliateId", "status");

-- CreateIndex
CREATE INDEX "AffiliateCommission_affiliateId_createdAt_idx" ON "AffiliateCommission"("affiliateId", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateCommission_status_availableAt_idx" ON "AffiliateCommission"("status", "availableAt");

-- CreateIndex
CREATE INDEX "AffiliateCommission_payoutId_idx" ON "AffiliateCommission"("payoutId");

-- CreateIndex
CREATE INDEX "AffiliateCommission_purchaseId_idx" ON "AffiliateCommission"("purchaseId");

-- CreateIndex
CREATE INDEX "AffiliatePayout_affiliateId_createdAt_idx" ON "AffiliatePayout"("affiliateId", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliatePayout_status_createdAt_idx" ON "AffiliatePayout"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Affiliate" ADD CONSTRAINT "Affiliate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "AffiliatePayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliatePayout" ADD CONSTRAINT "AffiliatePayout_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Payouts always carry money.
ALTER TABLE "AffiliatePayout" ADD CONSTRAINT "AffiliatePayout_usdCents_positive" CHECK ("usdCents" > 0);

-- Back-fill: one Referral per user who signed up with an invite code before this
-- release. Rewarded under the old rule (profile completed) → REWARDED with the coins
-- the inviter actually got; otherwise PENDING (they qualify under the new rules).
INSERT INTO "Referral" ("id", "inviterId", "inviteeId", "code", "source", "status", "qualifiedAt", "rewardedAt", "inviterCoins", "createdAt")
SELECT 'bf' || u."id",
       u."invitedById",
       u."id",
       i."inviteCode",
       'link',
       (CASE WHEN u."inviteRewardedAt" IS NOT NULL THEN 'REWARDED' ELSE 'PENDING' END)::"ReferralStatus",
       u."inviteRewardedAt",
       u."inviteRewardedAt",
       COALESCE((SELECT l."coins" FROM "LedgerEntry" l WHERE l."userId" = i."id" AND l."idempotencyKey" = 'invite:' || u."id"), 0),
       u."createdAt"
  FROM "User" u
  JOIN "User" i ON i."id" = u."invitedById"
ON CONFLICT ("inviteeId") DO NOTHING;

UPDATE "User" x
   SET "referralsRewarded" = r.n
  FROM (SELECT "inviterId", COUNT(*)::int AS n FROM "Referral" WHERE "status" = 'REWARDED' AND "inviterId" IS NOT NULL GROUP BY "inviterId") r
 WHERE x."id" = r."inviterId";
