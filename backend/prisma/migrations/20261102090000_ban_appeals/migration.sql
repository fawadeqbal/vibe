-- "Think this is a mistake? Tell us": appeals against an account pause.
CREATE TYPE "AppealStatus" AS ENUM ('OPEN', 'ACCEPTED', 'REJECTED');

CREATE TABLE "BanAppeal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bannedUntil" TIMESTAMP(3) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'OPEN',
    "staffNote" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "BanAppeal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BanAppeal_userId_bannedUntil_key" ON "BanAppeal"("userId", "bannedUntil");
CREATE INDEX "BanAppeal_status_createdAt_idx" ON "BanAppeal"("status", "createdAt");
ALTER TABLE "BanAppeal" ADD CONSTRAINT "BanAppeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Discover "welcome back": when Discover was last opened.
ALTER TABLE "User" ADD COLUMN "discoverSeenAt" TIMESTAMP(3);
