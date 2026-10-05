import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArticleShell } from "@/components/article-shell";
import { FaqStatic } from "@/components/faq-static";
import { JsonLd } from "@/components/json-ld";
import { Prose, readingMinutes, wordCount } from "@/components/prose";
import { RelatedLinks } from "@/components/related-links";
import { POSTS, postBySlug } from "@/content/posts";
import { formatDate } from "@/lib/dates";
import { breadcrumbLd, faqLd, ids, pageMetadata, stripInline } from "@/lib/seo";
import { abs, site } from "@/lib/site";

export const dynamicParams = false;
export const generateStaticParams = () => POSTS.map((p) => ({ slug: p.slug }));

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = postBySlug((await params).slug);
  if (!post) return {};
  return pageMetadata({ title: post.metaTitle ?? post.title, description: post.description, path: `/blog/${post.slug}/`, keywords: post.keywords, type: "article", published: post.published, modified: post.updated });
}

export default async function BlogPost({ params }: Props) {
  const post = postBySlug((await params).slug);
  if (!post) notFound();
  const path = `/blog/${post.slug}/`;
  const trail = [
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog/" },
    { name: post.title, path },
  ];
  const minutes = readingMinutes(post.blocks);
  const words = wordCount(post.blocks);
  return (
    <ArticleShell
      trail={trail}
      hero={
        <>
          <p className="mt-8 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted">
            <span className="eyebrow text-lavender">{post.category}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={post.published}>{formatDate(post.published)}</time>
            {post.updated && post.updated !== post.published && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Updated <time dateTime={post.updated}>{formatDate(post.updated)}</time>
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{minutes} min read</span>
          </p>
          <h1 className="mt-3 text-[clamp(32px,4.6vw,50px)] leading-[1.06] font-bold tracking-[-0.035em]">{post.title}</h1>
          <p className="mt-5 text-[18px] leading-[1.65] text-text2">{post.excerpt}</p>
          <p className="mt-5 text-[13px] text-muted">By the {site.name} team</p>
        </>
      }
    >
      <article>
        <Prose blocks={post.blocks} />
      </article>
      {post.faqs && <FaqStatic faqs={post.faqs} />}
      <RelatedLinks paths={post.related} />
      <JsonLd
        nodes={[
          {
            "@type": "BlogPosting",
            "@id": `${abs(path)}#article`,
            mainEntityOfPage: abs(path),
            headline: post.title,
            description: post.description,
            image: abs(`${path}opengraph-image`),
            datePublished: post.published,
            dateModified: post.updated ?? post.published,
            author: { "@type": "Organization", name: `${site.name} team`, url: abs("/") },
            publisher: { "@id": ids.org },
            isPartOf: { "@id": `${abs("/blog/")}#blog` },
            articleSection: post.category,
            keywords: post.keywords.join(", "),
            wordCount: words,
            inLanguage: "en",
            abstract: stripInline(post.excerpt),
          },
          breadcrumbLd(trail),
          ...(post.faqs ? [faqLd(post.faqs)] : []),
        ]}
      />
    </ArticleShell>
  );
}
