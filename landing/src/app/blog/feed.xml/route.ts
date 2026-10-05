import { POSTS } from "@/content/posts";
import { abs, site } from "@/lib/site";

export const dynamic = "force-static";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rfc822 = (iso: string) => new Date(`${iso}T09:00:00Z`).toUTCString();

/** RSS 2.0 feed of the blog: feed readers, aggregators and faster discovery. */
export function GET() {
  const items = POSTS.map(
    (p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${abs(`/blog/${p.slug}/`)}</link>
      <guid isPermaLink="true">${abs(`/blog/${p.slug}/`)}</guid>
      <pubDate>${rfc822(p.published)}</pubDate>
      <category>${esc(p.category)}</category>
      <description>${esc(p.excerpt)}</description>
    </item>`,
  ).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(`${site.name} blog`)}</title>
    <link>${abs("/blog/")}</link>
    <atom:link href="${abs("/blog/feed.xml")}" rel="self" type="application/rss+xml" />
    <description>${esc(`Guides, safety tips and news from ${site.name}.`)}</description>
    <language>en</language>
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
