import { JsonLd } from "@/components/json-ld";
import { Faq, FinalCta, Invite, Stats } from "@/components/sections/closing";
import { Gifts } from "@/components/sections/gifts";
import { Hero } from "@/components/sections/hero";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Safety } from "@/components/sections/safety";
import { Vip } from "@/components/sections/vip";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { FAQS } from "@/lib/faqs";
import { appLd, faqLd, webPageLd } from "@/lib/seo";
import { site } from "@/lib/site";

export const metadata = { title: { absolute: site.title } };

export default function LandingPage() {
  return (
    <>
      <a href="#main" className="sr-only z-50 rounded-full bg-text px-4 py-2 text-sm font-semibold text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <Hero />
        <HowItWorks />
        <Gifts />
        <Safety />
        <Vip />
        <Invite />
        <Stats />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
      <JsonLd nodes={[webPageLd({ path: "/", title: site.title, description: site.description, modified: site.updated }), appLd(), faqLd(FAQS)]} />
    </>
  );
}
