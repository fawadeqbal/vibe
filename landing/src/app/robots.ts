import type { MetadataRoute } from "next";

import { site } from "@/lib/site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    // Invite links (/i/<code>) only redirect to the home page: no need to crawl them.
    rules: { userAgent: "*", allow: "/", disallow: ["/i/"] },
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
