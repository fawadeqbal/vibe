-- Two grey ticks: when the message reached the other person's phone or an open tab.
ALTER TABLE "Message" ADD COLUMN "deliveredAt" TIMESTAMP(3);
-- Messages from before this count as delivered (read ones at least when they were read).
UPDATE "Message" SET "deliveredAt" = COALESCE("readAt", "createdAt");
-- Finding what's still on its way to someone, quickly.
CREATE INDEX "Message_undelivered_idx" ON "Message" ("friendshipId") WHERE "deliveredAt" IS NULL;
