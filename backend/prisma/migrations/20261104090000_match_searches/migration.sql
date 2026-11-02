-- Each search for a match: wait time, outcome (admin → Matching).
CREATE TABLE "MatchSearch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "outcome" VARCHAR(16),
    "waitMs" INTEGER,
    "rematchSoon" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MatchSearch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MatchSearch_startedAt_idx" ON "MatchSearch"("startedAt");
CREATE INDEX "MatchSearch_userId_endedAt_idx" ON "MatchSearch"("userId", "endedAt");
