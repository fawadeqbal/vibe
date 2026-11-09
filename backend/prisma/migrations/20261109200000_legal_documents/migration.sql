-- Legal pages (Terms, Privacy, Community Guidelines, Child Safety), edited in admin.
-- The text is seeded by the API on start (LegalService) when a page is missing.
CREATE TABLE "LegalDocument" (
    "slug" VARCHAR(40) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "summary" VARCHAR(300) NOT NULL DEFAULT '',
    "markdown" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("slug")
);

-- Which Terms version each person agreed to at sign-up.
ALTER TABLE "User" ADD COLUMN "termsVersion" INTEGER,
ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
