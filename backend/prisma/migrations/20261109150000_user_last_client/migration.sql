-- Which Vibe each person used last (android | ios | web): "who is on the app, who is on the web".
ALTER TABLE "User" ADD COLUMN "lastClient" VARCHAR(16);

-- Start from what we already know: the latest day each person was active on a client, else where they signed up.
UPDATE "User" u SET "lastClient" = latest.client
  FROM (SELECT DISTINCT ON ("userId") "userId", client FROM "ClientActivity" ORDER BY "userId", day DESC, client) latest
 WHERE latest."userId" = u.id;
UPDATE "User" SET "lastClient" = "signupClient" WHERE "lastClient" IS NULL AND "signupClient" IS NOT NULL;

CREATE INDEX "User_lastClient_idx" ON "User"("lastClient");
