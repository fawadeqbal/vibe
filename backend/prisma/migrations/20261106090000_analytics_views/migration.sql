-- Analytics: one place that defines who and what counts.
-- Admin pages read these views instead of re-deciding in every query.
-- Views keep raw timestamps; queries group them into business days with
-- BUSINESS_TZ_OFFSET_MINUTES, so the time zone stays a single setting.

-- A real person: not a dev bot, not a legacy admin account.
-- Deleted accounts stay in (they did sign up); filter on status where needed.
CREATE VIEW "vw_real_user" AS
SELECT u.id,
       u."createdAt"   AS created_at,
       u."onboardedAt" AS onboarded_at,
       u."countryCode" AS country,
       u."signupClient" AS client,
       u.status
  FROM "User" u
 WHERE u."isBot" = false
   AND u.role = 'USER';

-- A random video call between two real people, one row per side
-- (so "calls user X had" is a plain WHERE user_id = X).
CREATE VIEW "vw_real_call" AS
SELECT m.id AS match_id,
       side.user_id,
       side.partner_id,
       m."startedAt" AS started_at,
       m."endedAt"   AS ended_at,
       GREATEST(0, EXTRACT(EPOCH FROM (m."endedAt" - m."startedAt")))::int AS seconds
  FROM "Match" m
  JOIN "User" a ON a.id = m."userAId" AND a."isBot" = false
  JOIN "User" b ON b.id = m."userBId" AND b."isBot" = false
 CROSS JOIN LATERAL (VALUES (m."userAId", m."userBId"), (m."userBId", m."userAId")) AS side(user_id, partner_id)
 WHERE m.kind = 'RANDOM'
   AND m."endedAt" IS NOT NULL;

-- Real money: succeeded, not refunded, by a real person, and not through a
-- test gateway (dev-store, dev-wallet, card-dev — the provider each purchase
-- was started with is logged in PaymentEvent).
CREATE VIEW "vw_real_payment" AS
SELECT p.id,
       p."userId"      AS user_id,
       p."usdCents"    AS usd_cents,
       p.method,
       p."productType" AS product_type,
       p."productId"   AS product_id,
       p."completedAt" AS completed_at
  FROM "Purchase" p
  JOIN "User" u ON u.id = p."userId" AND u."isBot" = false AND u.role = 'USER'
 WHERE p.status = 'SUCCEEDED'
   AND p."refundedAt" IS NULL
   AND p."completedAt" IS NOT NULL
   AND NOT EXISTS (
         SELECT 1 FROM "PaymentEvent" e
          WHERE e."purchaseId" = p.id
            AND (e.provider IN ('dev-store', 'dev-wallet') OR e.provider LIKE '%-dev'));

-- One row per marketing-site visit, with what it led to.
-- A visit = one browser, ending after 30 idle minutes (landing/src/lib/track.ts).
CREATE VIEW "vw_site_visit" AS
SELECT v.id            AS visit_id,
       v."visitorId"   AS visitor_id,
       v."startedAt"   AS started_at,
       v."lastAt"      AS last_at,
       v.source,
       v.medium,
       v.campaign,
       v."landingPath" AS landing_page,
       v.country,
       v.region,
       v.city,
       v.device,
       v.os,
       v.browser,
       v.lang,
       v.pages,
       v.seconds,
       v."lastButton"  AS last_button,
       (v.pages > 1 OR v.seconds >= 10 OR v.clicks > 0)                AS engaged,
       (v.clicks > 0)                                                  AS clicked,
       EXISTS (SELECT 1 FROM "AppDownload" d WHERE d."visitId" = v.id) AS downloaded,
       ru.id                                                           AS user_id,
       (ru.id IS NOT NULL)                                             AS signed_up,
       EXISTS (SELECT 1 FROM "vw_real_call" c WHERE c.user_id = ru.id) AS had_call,
       -- Same as the Dashboard's "good first call": 60+ s (GOOD_CALL_SECONDS)
       -- with a real person within 48 hours of signing up.
       EXISTS (SELECT 1 FROM "vw_real_call" c
                WHERE c.user_id = ru.id AND c.seconds >= 60
                  AND c.started_at < ru.created_at + interval '48 hours') AS good_first_call,
       EXISTS (SELECT 1 FROM "vw_real_payment" p WHERE p.user_id = ru.id) AS paid
  FROM "SiteVisit" v
  LEFT JOIN "vw_real_user" ru ON ru.id = v."userId";
