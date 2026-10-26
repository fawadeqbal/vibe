-- One row per user per business day they had the app open; the admin funnel's
-- "came back the next day" reads it. Hand-checked: `migrate diff` also proposed
-- dropping the raw trigram search indexes; those lines were removed.

-- CreateTable
CREATE TABLE "UserActiveDay" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,

    CONSTRAINT "UserActiveDay_pkey" PRIMARY KEY ("userId","day")
);

-- CreateIndex
CREATE INDEX "UserActiveDay_day_idx" ON "UserActiveDay"("day");

-- AddForeignKey
ALTER TABLE "UserActiveDay" ADD CONSTRAINT "UserActiveDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from what already records activity: sign-ins and token refreshes
-- (Session rows), calls (Match) and last seen. Days are business days at the
-- default BUSINESS_TZ_OFFSET_MINUTES (+300, Pakistan).
INSERT INTO "UserActiveDay" ("userId", "day")
SELECT DISTINCT a.u, (a.at + interval '300 minutes')::date
  FROM (
    SELECT "userId" AS u, "createdAt" AS at FROM "Session"
    UNION ALL SELECT "userAId", "startedAt" FROM "Match"
    UNION ALL SELECT "userBId", "startedAt" FROM "Match"
    UNION ALL SELECT id, "lastSeenAt" FROM "User" WHERE "lastSeenAt" IS NOT NULL
  ) a
 WHERE EXISTS (SELECT 1 FROM "User" x WHERE x.id = a.u)
ON CONFLICT DO NOTHING;
