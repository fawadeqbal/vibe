"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Cta } from "@/components/cta";
import { Icon } from "@/components/icon";
import { Logo, LogoMark } from "@/components/logo";
import type { IconName } from "@/lib/icons";
import { appDeepLink, fetchPreview, type InvitePreview, parseInvite, playStoreUrl, webAppUrl } from "@/lib/invite";
import { site } from "@/lib/site";

const TRUST: { icon: IconName; label: string }[] = [
  { icon: "verified_user", label: "Selfie-verified people" },
  { icon: "blur_on", label: "Calls start blurred" },
  { icon: "flag", label: "Report in 2 taps" },
];

// The address never changes on this page: read it once on the client ("" while prerendering).
const noop = () => () => {};
const useLocation = () => useSyncExternalStore(noop, () => `${window.location.pathname}\n${window.location.search}`, () => "");

/**
 * "Ali invited you to Vibe · get 50 free coins": who invited you (first name
 * and photo, or the creator partner's name), then the Play Store (with the
 * install referrer), the web app (with ?ref=) and "open the app". An unknown
 * code shows the same page without a name or coins.
 */
export function InviteCard() {
  const loc = useLocation();
  const [path, search] = loc.split("\n");
  const ref = loc ? parseInvite(path, search ?? "") : null;
  const code = ref?.code ?? null;
  const source = ref?.source ?? null;
  const [preview, setPreview] = useState<{ code: string; data: InvitePreview | null } | null>(null);

  useEffect(() => {
    if (!code) return;
    const ctrl = new AbortController();
    void fetchPreview({ code, source }, ctrl.signal).then((data) => {
      if (!ctrl.signal.aborted) setPreview({ code, data });
    });
    return () => ctrl.abort();
  }, [code, source]);

  const p = preview?.code === code ? preview.data : null;
  const loading = !!code && preview?.code !== code;
  const valid = !!p?.valid;
  const name = valid ? p!.name : null;
  const partner = valid && p!.kind === "affiliate";
  const coins = valid ? p!.inviteeCoins : 0;
  const keep = valid ? ref : null;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute top-[-240px] left-1/2 h-[640px] w-[900px] -translate-x-1/2 bg-[radial-gradient(50%_50%_at_50%_50%,rgb(139_92_246/0.24),rgb(11_10_16/0)_70%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-[300px] left-1/2 h-[560px] w-[900px] -translate-x-1/2 bg-[radial-gradient(50%_50%_at_50%_50%,rgb(255_61_143/0.12),rgb(11_10_16/0)_70%)]" />

      <header className="relative mx-auto flex h-[68px] w-full max-w-[1140px] items-center px-4 sm:px-6">
        <Link href="/" aria-label={`${site.name} home`} className="rounded-lg">
          <Logo />
        </Link>
      </header>

      <main id="main" className="relative mx-auto flex w-full max-w-[560px] flex-1 flex-col items-center px-4 pt-6 pb-14 text-center sm:px-6 sm:pt-12">
        <Inviter name={name} avatarUrl={valid ? p!.avatarUrl : null} partner={partner} loading={loading} />

        <p className="eyebrow mt-7 text-lavender">{partner ? "Creator invite" : "You're invited"}</p>
        <h1 className="mt-3 text-[clamp(32px,7vw,48px)] leading-[1.06] font-bold tracking-[-0.035em]" aria-live="polite">
          {name ? (
            <>
              {name} invited you to <span className="serif text-pink-soft">{site.name}</span>
            </>
          ) : (
            <>
              Meet someone new on <span className="serif text-pink-soft">{site.name}</span>
            </>
          )}
        </h1>
        <p className="mt-4 max-w-[440px] text-base leading-[1.6] text-text2">
          Free random video chat with real, selfie-verified people.
          {coins > 0 ? (
            <>
              {" "}
              Join with this invite and get <span className="font-semibold whitespace-nowrap text-gold">{coins} free coins</span>.
            </>
          ) : (
            " One tap and you're face to face with someone new."
          )}
        </p>

        <div className="mt-8 flex w-full max-w-[380px] flex-col gap-3">
          <Cta href={playStoreUrl(keep)} size="xl" className="w-full">
            <Icon name="android" size={20} />
            Get it on Google Play
          </Cta>
          <Cta href={webAppUrl(keep)} variant="outline" size="lg" className="w-full">
            <Icon name="videocam" size={19} />
            Use {site.name} on the web
          </Cta>
        </div>
        <a href={appDeepLink(keep)} className="mt-4 text-[13.5px] text-text2 underline-offset-4 transition-colors hover:text-pink-soft hover:underline">
          Already have the app? Open it
        </a>

        {keep ? (
          <p className="mt-7 inline-flex items-center gap-2 rounded-full border border-line-strong px-3.5 py-1.5 text-[12.5px] text-text2">
            Invite code <span className="font-semibold tracking-[1px] text-text">{keep.code}</span>
          </p>
        ) : null}

        <ul className="mt-9 flex flex-wrap justify-center gap-x-5 gap-y-3">
          {TRUST.map((t) => (
            <li key={t.label} className="flex items-center gap-[7px] text-[13px] font-medium">
              <Icon name={t.icon} size={17} className="text-trust" />
              {t.label}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[12px] text-muted">
          18+ only · <Link href="/" className="underline-offset-4 hover:text-text2 hover:underline">What is {site.name}?</Link>
        </p>
      </main>
    </div>
  );
}

function Inviter({ name, avatarUrl, partner, loading }: { name: string | null; avatarUrl: string | null; partner: boolean; loading: boolean }) {
  const [broken, setBroken] = useState<string | null>(null);
  const showPhoto = !!avatarUrl && broken !== avatarUrl;
  return (
    <div className="relative grid size-[120px] place-items-center" aria-hidden="true">
      <span className="vl-ripple absolute inset-0 rounded-full border-[1.5px] border-pink/40" />
      <span className="vl-ripple absolute inset-0 rounded-full border-[1.5px] border-violet/40 [animation-delay:1.5s]" />
      {name ? (
        <span className="bg-brand relative grid size-[92px] place-items-center rounded-full p-[3px] shadow-[0_12px_34px_rgb(255_61_143/0.3)]">
          <span className="grid size-full place-items-center overflow-hidden rounded-full border-[3px] border-bg bg-bg2">
            {showPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl!} alt="" className="size-full object-cover" onError={() => setBroken(avatarUrl)} />
            ) : (
              <span className="text-[34px] font-bold text-text">{name.trim()[0]?.toUpperCase()}</span>
            )}
          </span>
          {partner ? (
            <span className="absolute -right-1 bottom-0 grid size-8 place-items-center rounded-full border-[3px] border-bg bg-violet text-white">
              <Icon name="verified_user" size={15} />
            </span>
          ) : null}
        </span>
      ) : (
        <span className={loading ? "vl-pulse" : ""}>
          <LogoMark size={76} stroke={6} />
        </span>
      )}
    </div>
  );
}
