import { POSTS, postBySlug } from "@/content/posts";
import { ogImage, ogSize } from "@/lib/og";
import { site } from "@/lib/site";

export const dynamicParams = false;
export const generateStaticParams = () => POSTS.map((p) => ({ slug: p.slug }));
export const alt = `${site.name} blog`;
export const size = ogSize;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const post = postBySlug((await params).slug)!;
  return ogImage({ kicker: `${post.category} · ${site.name} blog`, title: post.title });
}
