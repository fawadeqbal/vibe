import { CallTimer } from "@/components/call-timer";
import { Cta } from "@/components/cta";
import { Icon } from "@/components/icon";
import { OnlineNow } from "@/components/online-now";
import type { IconName } from "@/lib/icons";
import { site } from "@/lib/site";

const TRUST: { icon: IconName; label: string }[] = [
  { icon: "verified_user", label: "Selfie-verified" },
  { icon: "blur_on", label: "Calls start blurred" },
  { icon: "flag", label: "Report in 2 taps" },
];

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute top-[-220px] left-1/2 h-[620px] w-[900px] -translate-x-1/2 bg-[radial-gradient(50%_50%_at_50%_50%,rgb(139_92_246/0.22),rgb(11_10_16/0)_70%)]" />
      <div className="relative mx-auto flex max-w-[1140px] flex-wrap items-center justify-center gap-14 px-4 pt-12 pb-20 sm:px-6 sm:pt-[72px] sm:pb-24">
        <div className="max-w-[560px] min-w-0 flex-[1_1_440px]">
          <OnlineNow />
          <h1 className="mt-[22px] text-[clamp(40px,5.5vw,64px)] leading-[1.02] font-bold tracking-[-0.035em]">
            <span className="eyebrow mb-4 block text-lavender">Free random video chat</span>{" "}
            Meet someone new, <span className="serif text-pink-soft">right now.</span>
          </h1>
          <p className="mt-5 max-w-[460px] text-[17px] leading-[1.6] text-text2">
            {site.name} is free random video chat with real, selfie-verified people: one tap puts you face to face with someone new, anywhere in the world. Swipe to the next when the spark isn&apos;t there, stay when it is. No profile to build first, no waiting.
          </p>
          <div className="mt-[30px] flex flex-wrap items-center gap-3">
            <Cta href={site.links.webApp}>
              <Icon name="videocam" size={20} />
              Start matching — it&apos;s free
            </Cta>
            <Cta href={site.links.android} variant="outline" className="px-[22px] text-[15px]">
              <Icon name="android" size={18} />
              Android
            </Cta>
          </div>
          <ul className="mt-[26px] flex flex-wrap gap-x-5 gap-y-3">
            {TRUST.map((t) => (
              <li key={t.label} className="flex items-center gap-[7px] text-[13px] font-medium">
                <Icon name={t.icon} size={17} className="text-trust" />
                {t.label}
              </li>
            ))}
          </ul>
        </div>

        <CallPhone />
      </div>
    </section>
  );
}

/** A live call in the app: the product, shown rather than described. */
function CallPhone() {
  return (
    <div className="relative flex h-[660px] w-[440px] max-w-full flex-none items-center justify-center max-sm:h-[600px]">
      <div aria-hidden="true" className="absolute top-1/2 left-1/2 size-[560px] -translate-1/2 rounded-full bg-[radial-gradient(circle,rgb(139_92_246/0.2),rgb(255_61_143/0.06)_45%,rgb(11_10_16/0)_68%)]" />
      <figure
        aria-label={`A ${site.name} video call: Sofia, 24, verified, one minute in, chatting about where you're from`}
        className="relative z-[5] h-[620px] w-[300px] overflow-hidden rounded-[46px] border border-line-strong bg-bg shadow-[0_60px_120px_rgb(0_0_0/0.7),0_24px_80px_rgb(139_92_246/0.14)] max-sm:h-[580px] max-sm:w-[280px]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/sofia.jpg" alt="" fetchPriority="high" className="call-video absolute inset-0 size-full object-cover" />
        <div className="absolute inset-x-0 top-0 h-[150px] bg-linear-to-b from-bg/72 to-bg/0" />
        <div className="absolute inset-x-0 bottom-0 h-[240px] bg-linear-to-t from-bg/94 to-bg/0" />

        {/* "Blurred for safety" while the video sharpens */}
        <div aria-hidden="true" className="call-blur-badge glass absolute top-1/2 left-1/2 flex -translate-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold text-trust opacity-0">
          <Icon name="blur_on" size={15} />
          Blurred for safety
        </div>

        <div aria-hidden="true" className="absolute top-3 left-1/2 h-[22px] w-[84px] -translate-x-1/2 rounded-[11px] bg-bg" />

        <div className="call-chip glass absolute top-11 left-3.5 flex items-center gap-[9px] rounded-[22px] py-[5px] pr-[13px] pl-[5px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/sofia-80.jpg" alt="" className="size-[30px] rounded-full object-cover" />
          <span className="flex items-center gap-[5px]">
            <span className="text-[13.5px] font-semibold">Sofia, 24</span>
            <Icon name="verified" size={15} className="text-trust" />
          </span>
        </div>
        <div className="call-chip glass absolute top-12 right-3.5 flex h-7 items-center gap-1.5 rounded-[14px] px-2.5">
          <span className="block size-1.5 animate-pulse rounded-full bg-bad" />
          <CallTimer />
        </div>
        <div className="call-chip absolute top-[92px] right-3.5 h-[124px] w-[88px] overflow-hidden rounded-[18px] border-[1.5px] border-white/30 shadow-[0_10px_26px_rgb(0_0_0/0.45)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/you.jpg" alt="" className="block size-full object-cover" />
        </div>

        <div className="absolute inset-x-3.5 bottom-24 flex flex-col gap-[7px] text-[13px] leading-[1.35]">
          <p className="call-bubble-1 glass max-w-[76%] self-start rounded-[16px_16px_16px_6px] border-white/10 bg-[rgb(18_16_26/0.55)] px-3 py-2">hey! where are you from?</p>
          <p className="call-bubble-2 max-w-[76%] self-end rounded-[16px_16px_6px_16px] bg-violet/65 px-3 py-2 backdrop-blur-[18px]">
            Lahore! you? <span aria-hidden="true">😄</span>
          </p>
        </div>

        <div aria-hidden="true" className="absolute inset-x-0 bottom-[22px] flex items-center justify-center gap-4">
          <span className="glass grid size-11 place-items-center rounded-full border-white/14 bg-[rgb(18_16_26/0.55)] text-pink">
            <Icon name="favorite" size={20} />
          </span>
          <span className="bg-brand grid size-[58px] place-items-center rounded-full text-white shadow-[0_10px_26px_rgb(255_61_143/0.45)]">
            <Icon name="skip_next" size={30} />
          </span>
          <span className="glass grid size-11 place-items-center rounded-full border-white/14 bg-[rgb(18_16_26/0.55)] text-gold">
            <Icon name="redeem" size={20} />
          </span>
        </div>
      </figure>
    </div>
  );
}
