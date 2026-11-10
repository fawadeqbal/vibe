-- "Clear chat" for one side only: messages up to then are hidden for that person; the other keeps them.
ALTER TABLE "Friendship" ADD COLUMN "clearedLowAt" TIMESTAMP(3);
ALTER TABLE "Friendship" ADD COLUMN "clearedHighAt" TIMESTAMP(3);
