import { PAGES, pageBySlug } from "@/content/pages";
import { ogImage, ogSize } from "@/lib/og";
import { site } from "@/lib/site";

export const dynamicParams = false;
export const generateStaticParams = () => PAGES.map((p) => ({ slug: p.slug }));
export const alt = `${site.name} — free random video chat`;
export const size = ogSize;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const page = pageBySlug((await params).slug)!;
  return ogImage({ kicker: page.kicker, title: page.h1, subtitle: "Real, selfie-verified people · Free · 18+" });
}
