import { SiteHeader } from "@/components/site-header";
import { Faq, FinalCta, Invite, SiteFooter, Stats } from "@/components/sections/closing";
import { Gifts } from "@/components/sections/gifts";
import { Hero } from "@/components/sections/hero";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Safety } from "@/components/sections/safety";
import { Vip } from "@/components/sections/vip";
import { FAQS } from "@/lib/faqs";
import { site } from "@/lib/site";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "MobileApplication", name: site.name, operatingSystem: "Android", applicationCategory: "SocialNetworkingApplication", description: site.description, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
    { "@type": "FAQPage", mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ],
};

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </>
  );
}
