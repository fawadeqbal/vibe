-- Which profile photo / Moment passed the nudity check. Everything uploaded
-- before the filter existed starts unchecked and is checked by the sweeper.
ALTER TABLE "User" ADD COLUMN "avatarCheckedUrl" TEXT;
ALTER TABLE "Moment" ADD COLUMN "checkedAt" TIMESTAMP(3);
