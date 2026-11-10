-- A sender changed the text of their message: shown as "edited".
ALTER TABLE "Message" ADD COLUMN "editedAt" TIMESTAMP(3);
