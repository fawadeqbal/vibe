import type { Metadata } from "next";

import { abs, site } from "@/lib/site";

/**
 * Per-page metadata in one shape: canonical, Open Graph, Twitter card.
 * `path` is the page's own path with the trailing slash the export uses ("/blog/").
 * Share images come from each route's opengraph-image file automatically.
 */
export function pageMetadata(opts: {
  title: string;
  description: string;
  path: string;
  keywords?: readonly string[];
  type?: "website" | "article";
  published?: string;
  modified?: string;
  /** Use the title as-is (no " | Brand" suffix from the layout template). */
  absoluteTitle?: boolean;
}): Metadata {
  const { title, description, path, keywords, type = "website", published, modified, absoluteTitle } = opts;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    keywords: keywords ? [...keywords] : undefined,
    alternates: { canonical: path },
    openGraph: {
      type,
      url: path,
      siteName: site.name,
      locale: site.locale,
      title,
      description,
      ...(type === "article" ? { publishedTime: published, modifiedTime: modified ?? published, authors: [site.url] } : {}),
    },
    twitter: { card: "summary_large_image", title, description, ...(site.twitter ? { site: site.twitter, creator: site.twitter } : {}) },
  };
}

// ── schema.org ──────────────────────────────────────────────────────────────
// Ids tie the graph together across pages: every page points at the same
// Organization / WebSite / app nodes.
export const ids = {
  org: `${site.url}/#organization`,
  website: `${site.url}/#website`,
  app: `${site.url}/#app`,
};

export const organizationLd = () => ({
  "@type": "Organization",
  "@id": ids.org,
  name: site.legalName,
  alternateName: site.legalName !== site.name ? site.name : undefined,
  url: abs("/"),
  logo: { "@type": "ImageObject", url: abs("/icons/icon-512.png"), width: 512, height: 512 },
  sameAs: site.sameAs.length ? site.sameAs : undefined,
  contactPoint: site.supportEmail ? { "@type": "ContactPoint", contactType: "customer support", email: site.supportEmail } : undefined,
});

export const websiteLd = () => ({
  "@type": "WebSite",
  "@id": ids.website,
  name: site.name,
  url: abs("/"),
  description: site.description,
  inLanguage: "en",
  publisher: { "@id": ids.org },
});

/** The product: one app on Android and in the browser. No ratings until they're real. */
export const appLd = () => ({
  "@type": ["MobileApplication", "WebApplication"],
  "@id": ids.app,
  name: site.name,
  url: abs("/"),
  description: site.description,
  applicationCategory: "SocialNetworkingApplication",
  operatingSystem: "Android, Web browser",
  browserRequirements: "Requires a modern browser with camera and microphone access (WebRTC).",
  installUrl: /^https?:/.test(site.links.android) ? site.links.android : undefined,
  image: abs("/icons/icon-512.png"),
  screenshot: abs("/opengraph-image"),
  publisher: { "@id": ids.org },
  contentRating: "18+",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD", category: "free" },
  featureList: [
    "One-tap random video chat",
    "Selfie-verified profiles",
    "Calls start blurred",
    "Two-tap reporting, reviewed 24/7",
    "Gender and country filters",
    "Live gifts that convert to cash",
    "Cash out to JazzCash, Easypaisa or bank",
  ],
});

export const breadcrumbLd = (trail: { name: string; path: string }[]) => ({
  "@type": "BreadcrumbList",
  itemListElement: trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, item: abs(t.path) })),
});

export const faqLd = (faqs: { q: string; a: string }[]) => ({
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: stripInline(f.a) } })),
});

export const webPageLd = (opts: { path: string; title: string; description: string; modified?: string; type?: string }) => ({
  "@type": opts.type ?? "WebPage",
  "@id": `${abs(opts.path)}#webpage`,
  url: abs(opts.path),
  name: opts.title,
  description: opts.description,
  inLanguage: "en",
  isPartOf: { "@id": ids.website },
  about: { "@id": ids.app },
  dateModified: opts.modified,
  primaryImageOfPage: { "@type": "ImageObject", url: abs(`${opts.path}opengraph-image`) },
});

/** `[text](href)` and `**bold**` → plain text, for schema and feeds. */
export const stripInline = (s: string) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1");

/** Serialize a @graph for a <script type="application/ld+json">, safe inside HTML. */
export const ldJson = (...nodes: object[]) =>
  JSON.stringify({ "@context": "https://schema.org", "@graph": nodes }, (_k, v) => (v === undefined ? undefined : v)).replace(/</g, "\\u003c");
