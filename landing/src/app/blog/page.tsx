import type { Metadata } from "next";

import { ArticleShell } from "@/components/article-shell";
import { Icon } from "@/components/icon";
import { JsonLd } from "@/components/json-ld";
import { readingMinutes } from "@/components/prose";
import { POSTS } from "@/content/posts";
import { formatDate } from "@/lib/dates";
import { breadcrumbLd, ids, pageMetadata, webPageLd } from "@/lib/seo";
import { abs, site } from "@/lib/site";

const title = "Video Chat Guides, Safety Tips & News";
const description = `Guides from ${site.name} on random video chat: safety tips, conversation starters, Omegle alternatives, earning from gifts and making friends online.`;

export const metadata: Metadata = pageMetadata({ title, description, path: "/blog/" });

export default function BlogIndex() {
  const trail = [
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog/" },
  ];
  return (
    <ArticleShell
      trail={trail}
      hero={
        <>
          <p className="eyebrow mt-8 text-lavender">{site.name} blog</p>
          <h1 className="mt-3 text-[clamp(34px,5vw,54px)] leading-[1.04] font-bold tracking-[-0.035em]">
            Guides for meeting people <span className="serif text-pink-soft">on camera</span>
          </h1>
          <p className="mt-5 text-[18px] leading-[1.65] text-text2">Safety tips, conversation starters, earning from gifts and everything else about talking to strangers on video.</p>
        </>
      }
    >
      <ul className="flex flex-col gap-3.5">
        {POSTS.map((p) => (
          <li key={p.slug}>
            <a href={`/blog/${p.slug}/`} className="group block rounded-3xl border border-line bg-bg2 p-6 transition-colors duration-300 hover:border-white/14 sm:p-7">
              <p className="flex flex-wrap items-center gap-x-2.5 text-[12.5px] text-muted">
                <span className="eyebrow text-lavender">{p.category}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={p.published}>{formatDate(p.published)}</time>
                <span aria-hidden="true">·</span>
                <span>{readingMinutes(p.blocks)} min read</span>
              </p>
              <h2 className="mt-3 text-[clamp(19px,2.2vw,23px)] leading-snug font-semibold tracking-[-0.02em]">{p.title}</h2>
              <p className="mt-2 text-[15px] leading-[1.6] text-text2">{p.excerpt}</p>
              <span className="mt-4 flex items-center gap-1 text-[13px] font-semibold text-pink-soft">
                Read article
                <Icon name="arrow_outward" size={16} className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </a>
          </li>
        ))}
      </ul>
      <JsonLd
        nodes={[
          webPageLd({ path: "/blog/", title, description, type: "CollectionPage" }),
          breadcrumbLd(trail),
          {
            "@type": "Blog",
            "@id": `${abs("/blog/")}#blog`,
            name: `${site.name} blog`,
            url: abs("/blog/"),
            publisher: { "@id": ids.org },
            blogPost: POSTS.map((p) => ({ "@type": "BlogPosting", headline: p.title, url: abs(`/blog/${p.slug}/`), datePublished: p.published })),
          },
        ]}
      />
    </ArticleShell>
  );
}
