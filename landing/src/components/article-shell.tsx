import type { ReactNode } from "react";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { FinalCta } from "@/components/sections/closing";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/** Header + hero band + readable column + closing CTA + footer, for every non-home page. */
export function ArticleShell({ trail, hero, children, cta = true }: { trail: { name: string; path: string }[]; hero: ReactNode; children: ReactNode; cta?: boolean }) {
  return (
    <>
      <a href="#main" className="sr-only z-50 rounded-full bg-text px-4 py-2 text-sm font-semibold text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <div className="relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute top-[-260px] left-1/2 h-[560px] w-[900px] -translate-x-1/2 bg-[radial-gradient(50%_50%_at_50%_50%,rgb(139_92_246/0.18),rgb(11_10_16/0)_70%)]" />
          <div className="relative mx-auto max-w-[800px] px-4 pt-10 pb-12 sm:px-6 sm:pt-14">
            <Breadcrumbs trail={trail} />
            {hero}
          </div>
        </div>
        <div className="mx-auto max-w-[800px] px-4 pb-20 sm:px-6">{children}</div>
        {cta && <FinalCta />}
      </main>
      <SiteFooter />
    </>
  );
}
