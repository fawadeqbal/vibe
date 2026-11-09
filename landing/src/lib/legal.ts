import { site } from "@/lib/site";

export type LegalSlug = "terms" | "privacy" | "guidelines" | "child-safety";

export interface LegalDoc {
  slug: LegalSlug;
  title: string;
  summary: string;
  /** Escaped, server-rendered HTML (only headings, paragraphs, lists, bold, links). */
  html: string;
  version: number;
  updatedAt: string;
}

/** Shown if the API can't be reached at build time; the page loads the text in the browser. */
export const LEGAL_META: Record<LegalSlug, { title: string; summary: string }> = {
  terms: { title: "Terms of Use", summary: "The agreement between you and Vibe." },
  privacy: { title: "Privacy Policy", summary: "What we collect, why, who sees it and how long we keep it." },
  guidelines: { title: "Community Guidelines", summary: "How to be on Vibe: the rules on camera, in photos and in chats." },
  "child-safety": { title: "Child Safety Standards", summary: "Our zero-tolerance standards against child sexual abuse and exploitation." },
};

/** At build time: the current text, so the page works without JavaScript. Null if the API is unreachable. */
export async function fetchLegal(slug: LegalSlug): Promise<LegalDoc | null> {
  const url = site.legalUrl(slug);
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return r.ok ? ((await r.json()) as LegalDoc) : null;
  } catch {
    return null;
  }
}
