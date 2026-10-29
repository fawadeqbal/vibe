import { PAGES } from "@/content/pages";
import { POSTS } from "@/content/posts";
import { FAQS } from "@/lib/faqs";
import { abs, site } from "@/lib/site";

export const dynamic = "force-static";

/**
 * /llms.txt — a plain-text map of the site for AI assistants and answer
 * engines (ChatGPT, Perplexity, Gemini, Claude), per llmstxt.org.
 */
export function GET() {
  const body = [
    `# ${site.name}`,
    "",
    `> ${site.description}`,
    "",
    `${site.name} is a random video chat app on the web (${site.links.webApp}) and Android. Key facts:`,
    "- One tap connects you on live video with a random person; Next skips to someone else.",
    "- Safety: selfie verification with a visible badge (optional verified-only matching), every call starts blurred, report button always on screen with 24/7 review, 18+ only.",
    "- Discover: swipe real, active people; two likes make a match and open a chat. Free likes every day; Super Likes; 'Liked you' list (VIP sees who).",
    "- Video calls in chat only after both people tap Allow; either can turn them off. Calls with friends are free.",
    "- Free to match and chat. Optional coins (packs from $0.99) for gifts, boosts, Super Likes and filters (free during the daily Vibe Hour); VIP from $2.99 with a 3-day free trial: unlimited likes, every filter free, no ads, priority matching.",
    "- Daily reasons to return: Vibe Hour (free filters, double XP), friend streaks, levels and a weekly leaderboard.",
    "- Gifts: recipients keep 50% of a gift's value as gems, which cash out to JazzCash, Easypaisa or a bank account (IBAN).",
    "- Payments in PKR via JazzCash, Easypaisa, card or bank transfer (web and direct Android download); USD via Google Play.",
    "",
    "## Pages",
    `- [Home](${abs("/")}): overview, how it works, Discover, safety, Vibe Hour, VIP, FAQ`,
    ...PAGES.map((p) => `- [${p.navLabel}](${abs(`/${p.slug}/`)}): ${p.description}`),
    "",
    "## Guides",
    ...POSTS.map((p) => `- [${p.title}](${abs(`/blog/${p.slug}/`)}): ${p.description}`),
    "",
    "## FAQ",
    ...FAQS.map((f) => `- ${f.q} ${f.a}`),
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
