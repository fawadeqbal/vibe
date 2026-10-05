import type { MetadataRoute } from "next";

import { PAGES } from "@/content/pages";
import { POSTS } from "@/content/posts";
import { abs, site } from "@/lib/site";

export const dynamic = "force-static";

/** Every indexable URL, with real last-modified dates and its share image. */
export default function sitemap(): MetadataRoute.Sitemap {
  const latestPost = POSTS.map((p) => p.updated ?? p.published).sort().at(-1) ?? site.updated;
  return [
    { url: abs("/"), lastModified: site.updated, changeFrequency: "weekly", priority: 1, images: [abs("/opengraph-image")] },
    ...PAGES.map((p) => ({ url: abs(`/${p.slug}/`), lastModified: p.updated, changeFrequency: "monthly" as const, priority: 0.9, images: [abs(`/${p.slug}/opengraph-image`)] })),
    { url: abs("/blog/"), lastModified: latestPost, changeFrequency: "weekly", priority: 0.7 },
    ...POSTS.map((p) => ({ url: abs(`/blog/${p.slug}/`), lastModified: p.updated ?? p.published, changeFrequency: "monthly" as const, priority: 0.6, images: [abs(`/blog/${p.slug}/opengraph-image`)] })),
  ];
}
