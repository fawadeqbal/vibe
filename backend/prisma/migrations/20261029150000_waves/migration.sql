-- Waves: a 👋 between two people from "Recently here"; matched first when both search.
-- CreateTable
CREATE TABLE "Wave" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMP(3),

    CONSTRAINT "Wave_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Wave_toId_createdAt_idx" ON "Wave"("toId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Wave_fromId_toId_key" ON "Wave"("fromId", "toId");

-- AddForeignKey
ALTER TABLE "Wave" ADD CONSTRAINT "Wave_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wave" ADD CONSTRAINT "Wave_toId_fkey" FOREIGN KEY ("toId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
