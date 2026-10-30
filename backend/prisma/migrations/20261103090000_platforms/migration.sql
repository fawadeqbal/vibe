-- "Download the app" on the marketing site, counted before the redirect to the APK.
CREATE TABLE "AppDownload" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "platform" VARCHAR(16) NOT NULL,
    "visitId" TEXT,
    "button" VARCHAR(40),
    "source" VARCHAR(40),
    "country" VARCHAR(2),
    "device" VARCHAR(16),

    CONSTRAINT "AppDownload_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppDownload_at_idx" ON "AppDownload"("at");

-- Where each account was made: android (the app), ios or web.
ALTER TABLE "User" ADD COLUMN "signupClient" VARCHAR(16);

-- Sign-ups made before this: the first login's browser tells us
-- (the Android app identifies as "Dart/…").
UPDATE "User" u
   SET "signupClient" = CASE WHEN s."userAgent" LIKE 'Dart/%' THEN 'android' ELSE 'web' END
  FROM (SELECT DISTINCT ON ("userId") "userId", "userAgent" FROM "Session" ORDER BY "userId", "createdAt") s
 WHERE s."userId" = u.id AND u."signupClient" IS NULL AND s."userAgent" IS NOT NULL;

-- Who used which client each day.
CREATE TABLE "ClientActivity" (
    "day" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "client" VARCHAR(16) NOT NULL,

    CONSTRAINT "ClientActivity_pkey" PRIMARY KEY ("day","userId","client")
);

CREATE INDEX "ClientActivity_day_client_idx" ON "ClientActivity"("day", "client");
