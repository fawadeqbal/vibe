"use client";

import { useEffect, useState } from "react";

import { type LegalDoc, type LegalSlug } from "@/lib/legal";
import { site } from "@/lib/site";

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** The page text: from the build if it had it, then the latest from the API. */
export function LegalText({ slug, initial }: { slug: LegalSlug; initial: LegalDoc | null }) {
  const [doc, setDoc] = useState<LegalDoc | null>(initial);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const url = site.legalUrl(slug);
    if (!url) return;
    let live = true;
    fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<LegalDoc>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => live && setDoc(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [slug]);

  if (!doc) {
    return failed ? (
      <p className="text-text2">
        This page couldn&apos;t load right now. Please try again, or e-mail {site.supportEmail ? <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> : "us"}.
      </p>
    ) : (
      <p className="text-muted">Loading…</p>
    );
  }
  return (
    <>
      <p className="mb-6 text-[13px] text-muted">
        Last updated {dateFmt.format(new Date(doc.updatedAt))} · version {doc.version}
      </p>
      {/* Server-rendered from admin markdown with everything escaped (backend legal-markdown.ts). */}
      <div className="prose-site" dangerouslySetInnerHTML={{ __html: doc.html }} />
    </>
  );
}
