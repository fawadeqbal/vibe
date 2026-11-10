"use client";

import { VibeMark } from "@/components/ui/brand";
import { Headline } from "@/components/ui/typography";
import { config } from "@/lib/config";

/**
 * The only screen people see where Vibe isn't offered (the API answered
 * 451 REGION_UNAVAILABLE; admin → Settings → Region). Nothing to tap into:
 * every other screen would fail the same way.
 */
export function RegionUnavailable() {
  const link = "text-[13.5px] text-text2 underline-offset-4 hover:text-text hover:underline";
  return (
    <main
      className="fixed inset-0 z-[55] flex flex-col items-center justify-center overflow-y-auto px-7 py-12 text-center"
      style={{ background: "radial-gradient(120% 90% at 50% 30%, #1B0F2E 0%, #0B0A10 62%)" }}
    >
      <VibeMark size={64} />
      <p className="type-overline mt-9 !text-lavender">Not available</p>
      <Headline text="Vibe isn't available in your " accent="region" size={28} align="center" className="mt-3 max-w-[340px]" />
      <p className="type-body mt-4 max-w-[340px] text-[14.5px] leading-[1.55] text-text2">
        We don&apos;t offer Vibe in your country right now, so it can&apos;t be used from here. We&apos;re sorry for the trouble.
      </p>
      <p className="type-body mt-3 max-w-[340px] text-[13px] leading-[1.5] text-muted">
        Have an account? It stays as it is, and you can ask us to delete it any time.
      </p>
      <nav className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2">
        <a className={link} href={`${config.siteUrl}/delete-account/`}>
          Delete my account
        </a>
        <a className={link} href={`${config.siteUrl}/privacy/`}>
          Privacy
        </a>
        <a className={link} href={`${config.siteUrl}/terms/`}>
          Terms
        </a>
      </nav>
    </main>
  );
}
