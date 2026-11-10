-- Settings → Devices: which app and device each sign-in is, and why a session ended.
ALTER TABLE "Session" ADD COLUMN "client" VARCHAR(16);
ALTER TABLE "Session" ADD COLUMN "device" VARCHAR(80);
ALTER TABLE "Session" ADD COLUMN "revokeReason" VARCHAR(16);
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");
