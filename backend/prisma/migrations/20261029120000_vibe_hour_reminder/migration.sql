-- "Remind me" before Vibe Hour (push, or e-mail for people without the app).
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "vibeHourReminder" BOOLEAN NOT NULL DEFAULT false;
