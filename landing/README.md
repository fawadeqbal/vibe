# Vibe landing page

The public marketing page (`landing/`), built from the design handoff *Vibe Landing Page.dc.html*.
Next.js 16 + Tailwind 4, same colour tokens and typefaces as `web/`, exported as plain static files.

```
cd landing
cp .env.example .env.local   # fill in the links
npm install
npm run dev                  # http://localhost:3003
npm run build                # static site in out/
```

## Configuration (`.env.example`, baked in at build time)

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_WEB_APP_URL` | "Start matching", "Start 3-day free trial", "Invite a friend" → the web app |
| `NEXT_PUBLIC_ANDROID_URL` | "Get the app", "Android", "Get Vibe for Android" → Play Store or a direct .apk |
| `NEXT_PUBLIC_VIBE_API` | Live online count: `GET <API>/v1/stats/online` → `{ "online": n }`, polled every 30 s while the tab is visible |
| `NEXT_PUBLIC_ONLINE_FALLBACK` | Number shown before the first answer and when the API can't be reached (default 2743) |
| `NEXT_PUBLIC_BRAND_NAME` | Product name everywhere on the site (default Vibe) |
| `NEXT_PUBLIC_SITE_URL` | Canonical / Open Graph URLs, sitemap, robots, RSS |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, `_BING_…`, `_GA_ID`, `_SOCIAL_LINKS`, `_TWITTER_HANDLE` | Search Console / Bing verification, analytics, schema.org sameAs (see SEO.md) |
| `NEXT_PUBLIC_TERMS_URL`, `_PRIVACY_URL`, `_SUPPORT_URL` | Footer links (default: the FAQ) |

The online endpoint lives in `backend/src/modules/health/stats.controller.ts`: public, readable from any
origin (no `CORS_ORIGINS` change needed), cached 10 s per API instance.

## SEO, brand name and domain

The brand name and domain come from `NEXT_PUBLIC_BRAND_NAME` and `NEXT_PUBLIC_SITE_URL`
(in production: `BRAND_NAME` / `SITE_URL` in `infra/.env.prod`). Change them and rebuild to
rename the product or move domains. Keyword pages live in `src/content/pages.ts`, blog posts in
`src/content/posts.ts`. Full guide, launch checklist and ranking plan: **[SEO.md](SEO.md)**.

## Content to check before launch

- **Stats band** (`src/lib/site.ts` → `stats`): 1M+ matches, 150+ countries, 4.6★, 24/7 are the design's placeholders.
- **Hero photos** (`public/img/`): stock faces from pravatar.cc used in the design. Replace with photos you have rights to.
- Gift prices, VIP price, payout share and referral reward are written into the copy; if they change in admin → Economy, update the text.

## Deploy

```
docker build -t vibe-landing \
  --build-arg NEXT_PUBLIC_WEB_APP_URL=https://app.vibe.fawadiqbal.dev \
  --build-arg NEXT_PUBLIC_ANDROID_URL=https://play.google.com/store/apps/details?id=… \
  --build-arg NEXT_PUBLIC_VIBE_API=https://api.vibe.fawadiqbal.dev \
  --build-arg NEXT_PUBLIC_SITE_URL=https://vibe.fawadiqbal.dev .
docker run -p 3003:3003 vibe-landing
```

Or upload `out/` to any static host / CDN (security headers are in `nginx.conf`).

## Layout

- `src/app/` layout (fonts, metadata), page, OG image, robots, sitemap, `globals.css` (tokens)
- `src/components/sections/` one file per section: hero, how-it-works, gifts, safety, vip, closing (invite, stats, FAQ, final CTA, footer)
- `src/components/` header (phone menu), CTA links, inline icons, live online pill, call timer, safety switches, FAQ accordion
- `src/lib/site.ts` every link and number in one place; `src/lib/icons.ts` Material Symbols Rounded paths (no icon font)
