-- Photo safety: photos the nudity filter blocked or sent for review (kept 30 days).
CREATE TABLE "MediaFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "place" VARCHAR(8) NOT NULL,
    "refId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "action" VARCHAR(8) NOT NULL,
    "key" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaFlag_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MediaFlag_userId_createdAt_idx" ON "MediaFlag"("userId", "createdAt");
CREATE INDEX "MediaFlag_action_createdAt_idx" ON "MediaFlag"("action", "createdAt");
CREATE INDEX "MediaFlag_createdAt_idx" ON "MediaFlag"("createdAt");
