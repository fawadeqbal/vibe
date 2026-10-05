/**
 * Article content as data. Text supports two inline marks:
 * [link text](/path-or-url) and **bold**. Keep every claim true to the product.
 */
export type Block =
  | { p: string }
  | { h2: string }
  | { h3: string }
  | { ul: string[] }
  | { ol: string[] }
  | { table: { head: string[]; rows: string[][]; caption?: string } }
  /** A highlighted aside (tip, warning, key fact). */
  | { note: string }
  /** A call to action box: heading + one line; buttons are added by the renderer. */
  | { cta: { title: string; body: string } };

export type Faq = { q: string; a: string };

/** A search-intent landing page at /<slug>/. */
export type KeywordPage = {
  slug: string;
  /** <title> (≤ 60 chars incl. " | Brand"). */
  title: string;
  /** Meta description (≤ 160 chars). */
  description: string;
  keywords: string[];
  /** Small label above the H1. */
  kicker: string;
  h1: string;
  /** First paragraph under the H1: answer the search in one breath. */
  lede: string;
  blocks: Block[];
  faqs: Faq[];
  /** Paths to link at the end (other pages, blog posts). */
  related: string[];
  /** Short label for nav lists and the footer. */
  navLabel: string;
  updated: string;
};

export type Post = {
  slug: string;
  /** The H1 and share title. */
  title: string;
  /** Shorter <title> for search results when `title` runs past ~52 chars. */
  metaTitle?: string;
  description: string;
  keywords: string[];
  category: "Guides" | "Safety" | "Earning" | "News";
  published: string;
  updated?: string;
  /** One or two sentences for the blog index and feeds. */
  excerpt: string;
  blocks: Block[];
  faqs?: Faq[];
  related: string[];
};
