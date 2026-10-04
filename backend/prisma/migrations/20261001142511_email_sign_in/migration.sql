-- Sign-in moves from phone numbers (SMS) to e-mail codes.
ALTER TABLE "User" ADD COLUMN "email" TEXT;
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- Phone sign-in is retired. Existing phone-only accounts can no longer sign in
-- with a code; they keep their data and can be reached from the admin panel.
DROP INDEX IF EXISTS "User_phone_key";
ALTER TABLE "User" DROP COLUMN "phone";

-- Fast "contains" search on e-mails in the admin panel.
CREATE INDEX "User_email_trgm_idx" ON "User" USING GIN ("email" gin_trgm_ops);
