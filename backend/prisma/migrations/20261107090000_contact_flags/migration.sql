-- Chat safety: messages whose contact details were hidden, for moderators (kept 30 days).
CREATE TABLE "ContactFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "place" VARCHAR(8) NOT NULL,
    "refId" TEXT NOT NULL,
    "original" VARCHAR(1000) NOT NULL,
    "sent" VARCHAR(1000) NOT NULL,
    "kinds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactFlag_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactFlag_userId_createdAt_idx" ON "ContactFlag"("userId", "createdAt");
CREATE INDEX "ContactFlag_createdAt_idx" ON "ContactFlag"("createdAt");
