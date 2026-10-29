-- CreateEnum
CREATE TYPE "MatchKind" AS ENUM ('RANDOM', 'FRIEND');

-- AlterTable
ALTER TABLE "Friendship" ADD COLUMN     "callsHighAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "callsLowAllowed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "kind" "MatchKind" NOT NULL DEFAULT 'RANDOM';


