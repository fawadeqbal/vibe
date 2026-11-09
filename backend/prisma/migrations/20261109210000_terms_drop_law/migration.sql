-- Terms: drop "13. Law" (governing law / courts) until the business is
-- registered; "14. Contact" becomes 13. Only touches the shipped text: a
-- Terms page already edited in admin is left alone. Counts as a new version.
UPDATE "LegalDocument"
SET "markdown" = replace(
      "markdown",
      E'## 13. Law\n\nThese terms are governed by the laws of Pakistan, and disputes go to the courts of Pakistan, unless the law where you live gives you the right to use your local courts.\n\n## 14. Contact',
      E'## 13. Contact'
    ),
    "version" = "version" + 1,
    "updatedAt" = now()
WHERE "slug" = 'terms'
  AND position(E'## 13. Law\n\nThese terms are governed by the laws of Pakistan' in "markdown") > 0;
