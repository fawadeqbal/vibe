import type { MetadataRoute } from "next";

import { site } from "@/lib/site";

export const dynamic = "force-static";

/**
 * Search engines and AI answer engines are all welcome: being crawled is how
 * the site shows up in Google, Bing and in ChatGPT / Perplexity / Gemini /
 * Claude answers. They're named explicitly so a later "block all bots" rule
 * can't hide the site from them by accident.
 */
const AI_AND_SEARCH_BOTS = [
  "Googlebot",
  "Bingbot",
  "OAI-SearchBot", // ChatGPT search results
  "ChatGPT-User", // ChatGPT opening a page for a user
  "GPTBot",
  "PerplexityBot",
  "Perplexity-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "Google-Extended", // Gemini
  "Applebot",
  "Applebot-Extended",
  "DuckDuckBot",
  "YandexBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    // Invite links (/i/<code>) are personal (noindex): no need to crawl them.
    rules: [
      { userAgent: AI_AND_SEARCH_BOTS, allow: "/", disallow: ["/i/"] },
      { userAgent: "*", allow: "/", disallow: ["/i/"] },
    ],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
