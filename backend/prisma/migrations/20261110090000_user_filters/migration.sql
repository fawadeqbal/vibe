-- One set of filters for random matches and Discover, saved on the account.
ALTER TABLE "User" ADD COLUMN "filters" JSONB;
