import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArticleShell } from "@/components/article-shell";
import { Cta } from "@/components/cta";
import { FaqStatic } from "@/components/faq-static";
import { Icon } from "@/components/icon";
import { JsonLd } from "@/components/json-ld";
import { Prose } from "@/components/prose";
import { RelatedLinks } from "@/components/related-links";
import { PAGES, pageBySlug } from "@/content/pages";
import { breadcrumbLd, faqLd, pageMetadata, webPageLd } from "@/lib/seo";
import { site } from "@/lib/site";

export const dynamicParams = false;
export const generateStaticParams = () => PAGES.map((p) => ({ slug: p.slug }));

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = pageBySlug((await params).slug);
  if (!page) return {};
  return pageMetadata({ title: page.title, description: page.description, path: `/${page.slug}/`, keywords: page.keywords, modified: page.updated });
}

export default async function KeywordLandingPage({ params }: Props) {
  const page = pageBySlug((await params).slug);
  if (!page) notFound();
  const path = `/${page.slug}/`;
  const trail = [
    { name: "Home", path: "/" },
    { name: page.navLabel, path },
  ];
  return (
    <ArticleShell
      trail={trail}
      hero={
        <>
          <p className="eyebrow mt-8 text-lavender">{page.kicker}</p>
          <h1 className="mt-3 text-[clamp(34px,5vw,54px)] leading-[1.04] font-bold tracking-[-0.035em]">{page.h1}</h1>
          <p className="mt-5 text-[18px] leading-[1.65] text-text2">{page.lede}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Cta href={site.links.webApp}>
              <Icon name="videocam" size={20} />
              Start video chat — free
            </Cta>
            <Cta href={site.links.android} variant="outline" className="px-[22px] text-[15px]">
              <Icon name="android" size={18} />
              Android app
            </Cta>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-3">
            {(
              [
                ["verified_user", "Selfie-verified"],
                ["blur_on", "Calls start blurred"],
                ["flag", "Report in 2 taps"],
              ] as const
            ).map(([icon, label]) => (
              <li key={label} className="flex items-center gap-[7px] text-[13px] font-medium">
                <Icon name={icon} size={17} className="text-trust" />
                {label}
              </li>
            ))}
          </ul>
        </>
      }
    >
      <Prose blocks={page.blocks} />
      <FaqStatic faqs={page.faqs} />
      <RelatedLinks paths={page.related} />
      <JsonLd nodes={[webPageLd({ path, title: page.title, description: page.description, modified: page.updated }), breadcrumbLd(trail), faqLd(page.faqs)]} />
    </ArticleShell>
  );
}
