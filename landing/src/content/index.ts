import { PAGES } from "@/content/pages";
import { POSTS } from "@/content/posts";

/** Title + short label for any internal path, for related-link cards. */
export function linkInfo(path: string): { href: string; title: string; label: string; kind: string } | null {
  const page = PAGES.find((p) => `/${p.slug}/` === path);
  if (page) return { href: path, title: page.h1, label: page.navLabel, kind: page.kicker };
  const post = POSTS.find((p) => `/blog/${p.slug}/` === path);
  if (post) return { href: path, title: post.title, label: post.title, kind: post.category };
  return null;
}

export { PAGES, POSTS };
