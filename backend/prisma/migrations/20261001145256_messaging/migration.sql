-- E-mail templates, campaigns (e-mail + in-app), deliveries, inbox, e-mail opt-out.
-- CreateEnum
CREATE TYPE "CampaignAudience" AS ENUM ('USERS', 'SEGMENT', 'ALL');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'CANCELED', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "marketingEmails" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "MailTemplate" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "subject" VARCHAR(200) NOT NULL,
    "preheader" VARCHAR(200) NOT NULL DEFAULT '',
    "heading" VARCHAR(200) NOT NULL,
    "body" VARCHAR(5000) NOT NULL,
    "highlight" VARCHAR(100) NOT NULL DEFAULT '',
    "buttonLabel" VARCHAR(60) NOT NULL DEFAULT '',
    "buttonUrl" VARCHAR(500) NOT NULL DEFAULT '',
    "footer" VARCHAR(500) NOT NULL DEFAULT '',
    "custom" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailTemplate_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "sendEmail" BOOLEAN NOT NULL,
    "sendInApp" BOOLEAN NOT NULL,
    "important" BOOLEAN NOT NULL DEFAULT false,
    "audience" "CampaignAudience" NOT NULL,
    "userIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "segment" JSONB,
    "templateKey" TEXT,
    "subject" VARCHAR(200) NOT NULL,
    "preheader" VARCHAR(200) NOT NULL DEFAULT '',
    "heading" VARCHAR(200) NOT NULL,
    "body" VARCHAR(5000) NOT NULL,
    "buttonLabel" VARCHAR(60) NOT NULL DEFAULT '',
    "buttonUrl" VARCHAR(500) NOT NULL DEFAULT '',
    "footer" VARCHAR(500) NOT NULL DEFAULT '',
    "status" "CampaignStatus" NOT NULL DEFAULT 'QUEUED',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "emailSent" INTEGER NOT NULL DEFAULT 0,
    "emailFailed" INTEGER NOT NULL DEFAULT 0,
    "emailSkipped" INTEGER NOT NULL DEFAULT 0,
    "inAppSent" INTEGER NOT NULL DEFAULT 0,
    "cursor" TEXT,
    "lastError" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageDelivery" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT,
    "status" "DeliveryStatus" NOT NULL,
    "error" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(5000) NOT NULL,
    "buttonLabel" VARCHAR(60) NOT NULL DEFAULT '',
    "buttonUrl" VARCHAR(500) NOT NULL DEFAULT '',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_status_createdAt_idx" ON "Campaign"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Campaign_createdAt_idx" ON "Campaign"("createdAt");

-- CreateIndex
CREATE INDEX "MessageDelivery_campaignId_status_idx" ON "MessageDelivery"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MessageDelivery_campaignId_userId_key" ON "MessageDelivery"("campaignId", "userId");

-- CreateIndex
CREATE INDEX "UserMessage_userId_createdAt_idx" ON "UserMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserMessage_userId_readAt_idx" ON "UserMessage"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserMessage_campaignId_userId_key" ON "UserMessage"("campaignId", "userId");

-- AddForeignKey
ALTER TABLE "MessageDelivery" ADD CONSTRAINT "MessageDelivery_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMessage" ADD CONSTRAINT "UserMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

