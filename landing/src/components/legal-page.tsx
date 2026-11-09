import type { Metadata } from "next";

import { ArticleShell } from "@/components/article-shell";
import { LegalText } from "@/components/legal-text";
import { fetchLegal, LEGAL_META, type LegalSlug } from "@/lib/legal";
import { pageMetadata } from "@/lib/seo";

export function legalMetadata(slug: LegalSlug): Metadata {
  const m = LEGAL_META[slug];
  return pageMetadata({ title: m.title, description: m.summary, path: `/${slug}/` });
}

/** /terms/, /privacy/, /guidelines/, /child-safety/: text from admin → Legal pages. */
export async function LegalPage({ slug }: { slug: LegalSlug }) {
  const doc = await fetchLegal(slug);
  const meta = doc ?? LEGAL_META[slug];
  return (
    <ArticleShell
      cta={false}
      trail={[
        { name: "Home", path: "/" },
        { name: meta.title, path: `/${slug}/` },
      ]}
      hero={
        <>
          <h1 className="mt-4 text-[34px] leading-[1.1] font-extrabold tracking-[-0.02em] sm:text-[44px]">{meta.title}</h1>
          <p className="mt-3 text-[16px] text-text2">{meta.summary}</p>
        </>
      }
    >
      <LegalText slug={slug} initial={doc} />
    </ArticleShell>
  );
}
