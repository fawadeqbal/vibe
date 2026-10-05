import Link from "next/link";

import { Logo } from "@/components/logo";
import { PAGES, POSTS } from "@/content";
import { site } from "@/lib/site";

/**
 * Footer with every indexable page linked: users get a sitemap, crawlers
 * reach each page in one hop from anywhere on the site.
 */
export function SiteFooter() {
  const product = [
    { href: "/#how", label: "How it works" },
    { href: "/#gifts", label: "Gifts & earnings" },
    { href: "/#safety", label: "Safety" },
    { href: "/#vip", label: "VIP" },
    { href: "/#faq", label: "FAQ" },
    { href: site.links.webApp, label: "Open web app" },
    { href: site.links.android, label: "Android app" },
  ];
  const legal = [
    { href: site.links.terms, label: "Terms" },
    { href: site.links.privacy, label: "Privacy" },
    { href: site.links.support, label: "Support" },
  ];
  const cols = [
    { title: "Video chat", links: PAGES.map((p) => ({ href: `/${p.slug}/`, label: p.navLabel })) },
    { title: "Guides", links: [...POSTS.slice(0, 5).map((p) => ({ href: `/blog/${p.slug}/`, label: shortTitle(p.metaTitle ?? p.title) })), { href: "/blog/", label: "All articles →" }] },
    { title: site.name, links: product },
  ];
  return (
    <footer className="border-t border-line-soft">
      <div className="mx-auto max-w-[1140px] px-4 pt-14 pb-9 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1.2fr_0.9fr]">
          <div className="max-w-[300px]">
            <Link href="/" aria-label={`${site.name} home`} className="inline-block rounded-lg">
              <Logo size={24} stroke={2.1} textClass="text-[17px]" />
            </Link>
            <p className="mt-3.5 text-[13.5px] leading-[1.6] text-text2">
              Free random video chat with real, selfie-verified people. Calls start blurred, reports are reviewed 24/7. 18+ only — be kind on camera.
            </p>
          </div>
          {cols.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <p className="eyebrow text-muted">{c.title}</p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {c.links.map((l) => (
                  <li key={l.href + l.label}>
                    <a href={l.href} className="text-[13.5px] text-text2 underline-offset-4 transition-colors hover:text-pink-soft hover:underline">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line-soft pt-6">
          <p className="flex-1 text-[12.5px] text-muted">
            © {new Date().getFullYear()} {site.legalName}. {site.tagline}.
          </p>
          <nav aria-label="Legal" className="flex flex-wrap gap-5">
            {legal.map((l) => (
              <a key={l.label} href={l.href} className="text-[12.5px] text-muted underline-offset-4 transition-colors hover:text-pink-soft hover:underline">
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}

/** Footer label: the part before a colon / question mark ("What Happened to Omegle"). */
const shortTitle = (t: string) => t.split(/[:?]\s/)[0].replace(/\s*\(.*\)$/, "");
