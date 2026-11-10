-- The bell counts notifications since you last opened the page; each line stays unread until opened.
ALTER TABLE "User" ADD COLUMN "activitySeenAt" TIMESTAMP(3);
