-- CreateEnum
CREATE TYPE "SwipeKind" AS ENUM ('LIKE', 'SUPER', 'PASS');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'GIFT', 'SYSTEM');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "kind" "MessageKind" NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "meta" JSONB;

-- Existing gift messages
UPDATE "Message" SET "kind" = 'GIFT' WHERE "giftId" IS NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "showInDiscover" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "DiscoverSwipe" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "kind" "SwipeKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMP(3),

    CONSTRAINT "DiscoverSwipe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscoverSwipe_toId_kind_createdAt_idx" ON "DiscoverSwipe"("toId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "DiscoverSwipe_fromId_createdAt_idx" ON "DiscoverSwipe"("fromId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoverSwipe_fromId_toId_key" ON "DiscoverSwipe"("fromId", "toId");

-- AddForeignKey
ALTER TABLE "DiscoverSwipe" ADD CONSTRAINT "DiscoverSwipe_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoverSwipe" ADD CONSTRAINT "DiscoverSwipe_toId_fkey" FOREIGN KEY ("toId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

