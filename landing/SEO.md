# SEO — landing site

Everything search engines see is generated from a few config values and two
content files. Nothing about the brand or domain is hard-coded.

## Renaming the product / moving to a new domain

1. In `infra/.env.prod` change:
   - `BRAND_NAME=Vibe` → the new name (titles, headings, logo text, FAQ, schema, share images, RSS, llms.txt, manifest all follow)
   - `SITE_URL=https://vibe.fawadiqbal.dev` → the new address (canonicals, sitemap, robots, Open Graph, JSON-LD, feed)
   - optionally `BRAND_LEGAL_NAME` (company name shown as publisher)
2. Rebuild and redeploy `vibe-landing` (`deploy.ps1`, or `docker compose -f docker-compose.prod.yml up -d --build vibe-landing`).
3. **Keep the old domain alive as a 301 redirect** to the same path on the new one, so rankings and links carry over:
   ```nginx
   server {
     server_name vibe.fawadiqbal.dev;
     return 301 https://NEW-DOMAIN$request_uri;
   }
   ```
4. Google Search Console: add + verify the new domain, then on the *old* property use **Settings → Change of address**. Submit the new `/sitemap.xml`.
5. New logo? Replace `src/app/icon.svg`, `src/app/favicon.ico`, `src/app/apple-icon.png`, `public/icons/*` and the rings in `src/components/logo.tsx` / `src/lib/og.tsx`.
6. Also update elsewhere: Play Store listing name, `WEB_APP_URL`/`CORS_ORIGINS`, OAuth origins, invite-link `SITE_URL` in the app.

Tested: a build with `NEXT_PUBLIC_BRAND_NAME=Lumo NEXT_PUBLIC_SITE_URL=https://lumo.chat` contains zero "Vibe" and zero old-domain strings in any HTML, XML or text file.

## What's in place

| Area | Where |
|---|---|
| Titles, descriptions, keywords, canonical, Open Graph, Twitter cards per page | `src/lib/seo.ts` → `pageMetadata()` |
| Search-intent landing pages (8): Omegle alternative, random video chat, talk to strangers, Chatroulette alternative, video chat Pakistan, earn money, safe video chat, video chat online | `src/content/pages.ts` → `/<slug>/` |
| Blog (6 guides) + RSS | `src/content/posts.ts` → `/blog/`, `/blog/<slug>/`, `/blog/feed.xml` |
| Structured data: Organization, WebSite, MobileApplication+WebApplication, WebPage, FAQPage, BreadcrumbList, Blog, BlogPosting | `src/lib/seo.ts`, rendered per page |
| Share image per page (generated at build) | `src/lib/og.tsx`, `opengraph-image.tsx` files |
| Sitemap with lastmod + images, robots.txt, web manifest, favicon set | `src/app/sitemap.ts`, `robots.ts`, `manifest.ts` |
| `llms.txt` (for ChatGPT / Perplexity / Gemini answers) | `src/app/llms.txt/route.ts` |
| Footer links every page (crawl depth 1), breadcrumbs, related links | `site-footer.tsx`, `breadcrumbs.tsx`, `related-links.tsx` |
| 404 page (noindex), trailing-slash canonical URLs, nginx caching + MIME types | `not-found.tsx`, `nginx.conf` |
| Search Console / Bing / Yandex verification, GA4 (optional) | env vars, see `.env.example` |

Lighthouse (mobile): SEO 100, Best practices 100, Accessibility 96, Performance 75–88.

## Launch checklist (do once the site is live)

- [ ] Google Search Console → add property → copy the HTML-tag code into `GOOGLE_SITE_VERIFICATION` → rebuild → Verify.
- [ ] Search Console → Sitemaps → submit `sitemap.xml`. URL Inspection → *Request indexing* for `/`, `/omegle-alternative/`, `/random-video-chat/`, `/video-chat-pakistan/`.
- [ ] Bing Webmaster Tools → *Import from Google Search Console* (also covers DuckDuckGo, Yahoo, ChatGPT search).
- [ ] Optional: `GA_ID` for Google Analytics 4.
- [ ] Create the brand's Instagram / TikTok / X / Facebook / YouTube, put the URLs in `SOCIAL_LINKS` (comma-separated) and `TWITTER_HANDLE`. This helps Google show a knowledge panel for the name.
- [ ] Test a few URLs in Google's Rich Results Test and the Facebook / WhatsApp link preview.
- [ ] Replace placeholders before launch: stats band (1M+, 150+, **4.6★**, 24/7 in `src/lib/site.ts`) and the pravatar.cc stock faces. Don't add star-rating schema until ratings are real — Google penalises made-up review markup.

## What actually moves rankings (off-page, ongoing)

Technical SEO gets the site *eligible*; these get it *ranked*. "Random video chat" and "Omegle alternative" are very competitive; Pakistan-specific and long-tail terms ("video chat app JazzCash", "cash out Easypaisa video chat") are realistic within weeks to a few months. No one can guarantee position #1.

1. **Google Play listing** — use the main keywords in the title/short description ("Vibe: Random Video Chat"), link to the site. Play ranking and web ranking reinforce each other.
2. **Listings & directories** — AlternativeTo (as an alternative to Omegle, Chatroulette, Azar, Monkey), Product Hunt launch, Crunchbase, Pakistani startup directories.
3. **Backlinks** — Pakistani tech blogs (ProPakistani, TechJuice, MangoBaaz), guest posts, local press about earning via JazzCash/Easypaisa. A handful of real links beats hundreds of cheap ones; never buy link packages.
4. **Short video** — TikTok / Reels / YouTube Shorts of funny or wholesome calls (with consent), linking to the site.
5. **Keep publishing** — 2 posts a month in `src/content/posts.ts` (ideas: "Omegle vs Chatroulette vs …", "how to practise English with strangers", "is video chat halal / safe for…", city pages: Lahore, Karachi, Islamabad). Update `updated` dates when you refresh a page.
6. **A dedicated domain** — a short brandable `.com`/`.app` reads as more trustworthy in results than a subdomain of a personal site; swap it in with the steps above when ready.

## Adding content

- **New landing page**: add an object to `PAGES` in `src/content/pages.ts` (slug, ≤ 52-char title, ≤ 160-char description, H1, lede, blocks, FAQs, related). It gets its page, share image, schema, sitemap entry and footer link automatically.
- **New blog post**: add to the top of `POSTS` in `src/content/posts.ts`. Use `metaTitle` when the title is longer than ~52 characters.
- Text supports `[link](/path/)` and `**bold**`. Link new pieces from at least two existing ones.
- Keep every product claim true — if prices, payouts or features change in admin → Economy, update the copy.
