import type { Metadata } from "next";

import { Cta } from "@/components/cta";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { PAGES } from "@/content/pages";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: true }, alternates: { canonical: null } };

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto flex max-w-[800px] flex-col items-center px-4 py-24 text-center sm:px-6">
        <p className="eyebrow text-lavender">404</p>
        <h1 className="mt-3 text-[clamp(32px,4.6vw,48px)] leading-[1.06] font-bold tracking-[-0.035em]">
          This page skipped to <span className="serif text-pink-soft">next</span>
        </h1>
        <p className="mt-4 text-base text-text2">The link may be old or mistyped. Here&apos;s where people usually go:</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Cta href="/">Go to the home page</Cta>
          <Cta href="/blog/" variant="outline">Read the blog</Cta>
        </div>
        <ul className="mt-10 flex flex-wrap justify-center gap-x-5 gap-y-2">
          {PAGES.slice(0, 5).map((p) => (
            <li key={p.slug}>
              <a href={`/${p.slug}/`} className="text-[13.5px] text-text2 underline-offset-4 hover:text-pink-soft hover:underline">{p.navLabel}</a>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </>
  );
}
