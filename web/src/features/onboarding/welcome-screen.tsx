"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type CSSProperties, useRef, useState } from "react";

import { GradientButton } from "@/components/ui/button";
import { VibeLogo, VibeMark } from "@/components/ui/brand";
import { Glass } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { Headline } from "@/components/ui/typography";
import { useElementSize } from "@/hooks/use-element-size";
import { useIsDesktop } from "@/hooks/use-media-query";
import { color, type Tone } from "@/lib/colors";
import { cn } from "@/lib/cn";

interface Face {
  url: string;
  caption: string;
  chip?: { text: string; icon: string; tone: Tone };
}

interface Slide {
  title: string;
  accent: string;
  body: string;
  left: Face;
  right: Face;
  /** Icon where the cards meet; the brand mark when absent. */
  badge?: string;
}

const SLIDES: Slide[] = [
  {
    title: "Meet someone new, ",
    accent: "right now.",
    body: "One tap connects you on video with a real person somewhere in the world.",
    left: { url: "https://i.pravatar.cc/400?img=15", caption: "🇮🇳 Priya, 25" },
    right: { url: "https://i.pravatar.cc/400?img=20", caption: "🇺🇸 Sofia, 24", chip: { text: "Verified", icon: "verified", tone: "gem" } },
  },
  {
    title: "Not your vibe? ",
    accent: "Next.",
    body: "One tap and you are talking to someone else. There is always someone online.",
    left: { url: "https://i.pravatar.cc/400?img=33", caption: "🇹🇷 Mert, 26" },
    right: { url: "https://i.pravatar.cc/400?img=23", caption: "🇧🇷 Julia, 22", chip: { text: "You both like Music", icon: "interests", tone: "lavender" } },
    badge: "skip_next",
  },
  {
    title: "Get paid to be ",
    accent: "you.",
    body: "People send gifts to the ones they enjoy talking to. Gifts become gems, gems become cash.",
    left: { url: "https://i.pravatar.cc/400?img=44", caption: "🇵🇰 Ayesha, 23" },
    right: { url: "https://i.pravatar.cc/400?img=12", caption: "🇬🇧 Liam, 25", chip: { text: "+25 gems", icon: "diamond", tone: "gem" } },
    badge: "redeem",
  },
];

const PROMISES = [
  { icon: "verified_user", label: "Selfie-verified" },
  { icon: "blur_on", label: "Starts blurred" },
  { icon: "flag", label: "Report in 2 taps" },
];

/**
 * First screen ever. Real faces, one promise, the three safety promises right
 * under it, one button. Slides advance story-style (swipe or tap the bars).
 */
export function WelcomeScreen() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const pager = useRef<HTMLDivElement>(null);
  const slide = SLIDES[index];

  const goTo = (i: number) => pager.current?.scrollTo({ left: i * pager.current.clientWidth, behavior: "smooth" });
  const onScroll = () => {
    const el = pager.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== index) setIndex(Math.min(SLIDES.length - 1, Math.max(0, i)));
  };

  return (
    <div className="relative flex min-h-dvh flex-col bg-bg">
      {/* Soft violet glow behind the faces. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px]"
        style={{ background: "radial-gradient(circle min(85vw, 476px) at 50% 22.5%, rgb(139 92 246 / .22), rgb(11 10 16 / 0))" }}
        aria-hidden
      />
      <div className="relative mx-auto flex w-full max-w-[1120px] flex-1 flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <header className="flex items-center px-6 pt-3.5">
          <VibeLogo size={28} shadow={false} />
          <span className="type-title ml-2.5 flex-1 text-[19px]">Vibe</span>
          <span className="type-label flex h-[26px] items-center rounded-[13px] border border-white/18 px-2.5 text-[11px] tracking-[0.4px] text-text2">18+ only</span>
        </header>

        <div className="flex flex-1 flex-col lg:flex-row lg:items-center lg:gap-10 lg:px-6">
          <div className="flex flex-1 flex-col lg:max-w-[560px]">
            {/* Story-style progress. */}
            <div className="flex gap-1.5 px-6 pt-[18px] lg:px-0" role="tablist" aria-label="Slides">
              {SLIDES.map((s, i) => (
                <button key={i} type="button" role="tab" aria-selected={i === index} aria-label={`Slide ${i + 1}`} onClick={() => goTo(i)} className="flex-1 py-2">
                  <span className={cn("block h-[3px] rounded-[2px] transition-colors duration-250", i <= index ? "bg-text" : "bg-white/14")} />
                </button>
              ))}
            </div>
            <div ref={pager} onScroll={onScroll} className="no-scrollbar flex min-h-[220px] flex-1 snap-x snap-mandatory overflow-x-auto lg:min-h-[480px]">
              {SLIDES.map((s, i) => (
                <HeroCards key={i} slide={s} />
              ))}
            </div>
          </div>

          <div className="flex flex-col lg:max-w-[440px] lg:flex-1">
            <div className="px-7 lg:px-0">
              <div key={index} style={{ animation: "vibe-fade-in 220ms ease-out" }}>
                <Headline text={slide.title} accent={slide.accent} size={38} accentColor="pink-soft" />
                <p className="type-body mt-3.5 text-[15px] leading-[1.5] text-text2">{slide.body}</p>
              </div>
              <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2.5">
                {PROMISES.map((p) => (
                  <span key={p.label} className="inline-flex items-center">
                    <Icon name={p.icon} size={16} className="text-trust" />
                    <span className="type-label ml-1.5 text-[12px] font-medium text-text">{p.label}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="px-6 pt-7 pb-3 lg:px-0">
              <GradientButton label="Get started" icon="arrow_forward" iconAfter onClick={() => router.push("/sign-in")} />
            </div>
            <p className="type-body px-9 pb-3 text-center text-[11px] leading-[1.45] text-muted lg:px-0">
              By continuing you confirm you&apos;re 18+, agree to the{" "}
              <Link href="#" className="hover:text-text2">
                Terms
              </Link>{" "}
              and have read the{" "}
              <Link href="#" className="hover:text-text2">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Two tilted portrait cards with the brand mark (or a slide badge) where they
 * meet. The 330×300 composition scales to whatever room the slide gets.
 */
function HeroCards({ slide }: { slide: Slide }) {
  const box = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(box);
  const desktop = useIsDesktop();
  const scale = width && height ? Math.min(desktop ? 1.35 : 1, Math.max(0.4, Math.min(height / 300, width / 330))) : 1;
  return (
    <div ref={box} className="relative w-full shrink-0 snap-center overflow-hidden">
      <div className="absolute top-1/2 left-1/2 h-[300px] w-[330px]" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div className="absolute top-[22px] left-[14px] -rotate-[7deg]">
          <Card face={slide.left} />
        </div>
        <div className="absolute top-[30px] right-[14px] rotate-[6deg]">
          <Card face={slide.right} />
        </div>
        <div className="absolute inset-x-0 bottom-1.5 flex justify-center">
          <span className="flex size-14 items-center justify-center rounded-full border border-white/12 bg-bg2 shadow-[0_10px_35.6px_rgb(0_0_0/.5)]">
            {slide.badge ? (
              <Icon name={slide.badge} size={28} className="bg-brand bg-clip-text text-transparent" style={{ WebkitBackgroundClip: "text" } as CSSProperties} />
            ) : (
              <VibeMark size={30} />
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function Card({ face }: { face: Face }) {
  return (
    <div
      className="relative h-[236px] w-[168px] overflow-hidden rounded-[28px] border border-white/10 shadow-[0_24px_56.4px_rgb(0_0_0/.5)]"
      style={{ backgroundImage: "linear-gradient(to bottom, #2B1B4D, #1A1724)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={face.url} alt="" draggable={false} className="absolute inset-0 size-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
      {face.chip ? (
        <div className="absolute top-2.5 left-2.5">
          <Chip text={face.chip.text} icon={face.chip.icon} tone={face.chip.tone} />
        </div>
      ) : null}
      <div className="absolute bottom-2.5 left-2.5">
        <Chip text={face.caption} />
      </div>
    </div>
  );
}

function Chip({ text, icon, tone }: { text: string; icon?: string; tone?: Tone }) {
  return (
    <Glass radius={12} blur={16} className={cn("flex items-center border-transparent py-[5px] pr-[9px]", icon ? "pl-1.5" : "pl-[9px]")}>
      {icon ? <Icon name={icon} size={14} className="mr-1" style={{ color: tone ? color(tone) : undefined }} /> : null}
      <span className="type-label text-[11px] text-text">{text}</span>
    </Glass>
  );
}
