-- Voice-only or voice + video, per side
ALTER TABLE "Friendship" ADD COLUMN "callsLowVideo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "callsHighVideo" BOOLEAN NOT NULL DEFAULT false;
-- Calls allowed before this were video calls
UPDATE "Friendship" SET "callsLowVideo" = "callsLowAllowed", "callsHighVideo" = "callsHighAllowed";

-- Photos and voice notes in chat
ALTER TYPE "MessageKind" ADD VALUE 'PHOTO';
ALTER TYPE "MessageKind" ADD VALUE 'VOICE';

-- Replies, reactions, unsend
ALTER TABLE "Message" ADD COLUMN "replyToId" TEXT,
ADD COLUMN "reactions" JSONB,
ADD COLUMN "unsentAt" TIMESTAMP(3);
