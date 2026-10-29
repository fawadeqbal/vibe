-- CreateEnum
CREATE TYPE "SiteEventKind" AS ENUM ('VIEW', 'CLICK');

-- CreateTable
CREATE TABLE "SiteVisit" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "landingPath" TEXT NOT NULL,
    "referrerHost" TEXT,
    "source" TEXT NOT NULL,
    "medium" TEXT NOT NULL,
    "campaign" TEXT,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "device" TEXT NOT NULL,
    "os" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "lang" TEXT,
    "pages" INTEGER NOT NULL DEFAULT 1,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "lastButton" TEXT,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT,
    "signedUpAt" TIMESTAMP(3),

    CONSTRAINT "SiteVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteEvent" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "kind" "SiteEventKind" NOT NULL,
    "path" TEXT NOT NULL,
    "button" TEXT,
    "target" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SiteVisit_userId_key" ON "SiteVisit"("userId");

-- CreateIndex
CREATE INDEX "SiteVisit_startedAt_idx" ON "SiteVisit"("startedAt");

-- CreateIndex
CREATE INDEX "SiteVisit_lastAt_idx" ON "SiteVisit"("lastAt");

-- CreateIndex
CREATE INDEX "SiteVisit_visitorId_idx" ON "SiteVisit"("visitorId");

-- CreateIndex
CREATE INDEX "SiteEvent_at_idx" ON "SiteEvent"("at");

-- CreateIndex
CREATE INDEX "SiteEvent_visitId_idx" ON "SiteEvent"("visitId");

-- AddForeignKey
ALTER TABLE "SiteEvent" ADD CONSTRAINT "SiteEvent_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "SiteVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
