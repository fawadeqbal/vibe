import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/logo";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Not available in your region",
  description: `${site.name} isn't offered in your country.`,
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

/**
 * Where Cloudflare sends visitors from countries Vibe isn't offered in
 * (admin → Settings → Region; see infra/REGION.md). No links into the app:
 * they would only lead back here.
 */
export default function Unavailable() {
  return (
    <main id="main" className="mx-auto flex min-h-[100svh] max-w-[560px] flex-col items-center justify-center px-6 py-16 text-center">
      <Logo />
      <p className="eyebrow mt-10 text-lavender">Not available</p>
      <h1 className="mt-3 text-[clamp(28px,4.4vw,40px)] leading-[1.08] font-bold tracking-[-0.03em]">
        {site.name} isn&apos;t available in your <span className="serif text-pink-soft">region</span>
      </h1>
      <p className="mt-4 text-base text-text2">
        We don&apos;t offer {site.name} in your country right now, so the website and the app can&apos;t be used from here. We&apos;re sorry for the trouble.
      </p>
      <p className="mt-3 text-sm text-text2">
        Already have an account? Your data stays as it is; you can ask us to delete it any time.
      </p>
      <nav className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[13.5px] text-text2">
        <Link href="/delete-account/" className="underline-offset-4 hover:text-pink-soft hover:underline">Delete my account</Link>
        <Link href="/privacy/" className="underline-offset-4 hover:text-pink-soft hover:underline">Privacy</Link>
        <Link href="/terms/" className="underline-offset-4 hover:text-pink-soft hover:underline">Terms</Link>
      </nav>
    </main>
  );
}
