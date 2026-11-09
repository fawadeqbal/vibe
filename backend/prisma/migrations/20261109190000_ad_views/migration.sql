-- Store videos (rewarded ads): one row per view, for admin reporting.
CREATE TABLE "AdView" (
    "id" TEXT NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" VARCHAR(16) NOT NULL,
    "platform" VARCHAR(16) NOT NULL,
    "valued" BOOLEAN,
    "estimatedUsd" DECIMAL(12,7),
    "coins" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "watchedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "AdView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdView_token_key" ON "AdView"("token");
CREATE INDEX "AdView_createdAt_idx" ON "AdView"("createdAt");
CREATE INDEX "AdView_userId_createdAt_idx" ON "AdView"("userId", "createdAt");

ALTER TABLE "AdView" ADD CONSTRAINT "AdView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
