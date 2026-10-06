import { Cta } from "@/components/cta";
import { FaqList } from "@/components/faq-list";
import { Icon } from "@/components/icon";
import { site } from "@/lib/site";

export function Invite() {
  return (
    <section id="invite" aria-label="Invite a friend" className="border-t border-line-soft">
      <div className="mx-auto max-w-[1140px] px-4 py-12 sm:px-6">
        <div className="flex flex-wrap items-start gap-x-7 gap-y-[18px] rounded-3xl sm:items-center border border-white/8 bg-bg2 px-[26px] py-[22px]">
          <span className="grid size-[46px] shrink-0 place-items-center rounded-[14px] bg-violet/14 text-lavender">
            <Icon name="group_add" size={24} />
          </span>
          <div className="min-w-[220px] flex-1">
            <h2 className="text-base font-semibold">Give 50, get 100 coins</h2>
            <p className="mt-[3px] text-[13.5px] leading-normal text-text2">Share your invite link from the app. Your friend gets 50 coins and you get 100 once they&apos;re verified and have had 3 calls.</p>
          </div>
          <Cta href={`${site.links.webApp}/invite`} variant="outline" size="md">
            <Icon name="share" size={17} />
            Invite a friend
          </Cta>
        </div>
      </div>
    </section>
  );
}

export function Stats() {
  return (
    <section aria-label={`${site.name} in numbers`} className="border-t border-line-soft">
      <dl className="mx-auto grid max-w-[1140px] grid-cols-2 gap-6 px-4 py-14 text-center sm:px-6 md:grid-cols-4">
        {site.stats.map((s) => (
          <div key={s.label} className="flex flex-col-reverse">
            <dt className="mt-1 text-[13.5px] text-text2">{s.label}</dt>
            <dd className="bg-brand bg-clip-text text-[clamp(30px,3.4vw,40px)] font-bold tracking-[-0.03em] text-transparent tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="border-t border-line-soft">
      <div className="mx-auto max-w-[800px] px-4 py-20 sm:px-6 sm:py-[88px]">
        <h2 id="faq-title" className="text-center text-[clamp(28px,3.6vw,40px)] font-bold tracking-[-0.03em]">
          Questions, answered
        </h2>
        <FaqList />
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section id="download" aria-labelledby="download-title" className="relative overflow-hidden border-t border-line-soft">
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-[260px] left-1/2 h-[560px] w-[900px] -translate-x-1/2 bg-[radial-gradient(50%_50%_at_50%_50%,rgb(255_61_143/0.16),rgb(11_10_16/0)_70%)]" />
      <div className="relative mx-auto flex max-w-[1140px] flex-col items-center px-4 py-24 text-center sm:px-6 sm:py-[104px]">
        <div aria-hidden="true" className="relative grid size-[150px] place-items-center">
          <span className="vl-ripple absolute inset-0 rounded-full border-[1.5px] border-pink/40" />
          <span className="vl-ripple absolute inset-0 rounded-full border-[1.5px] border-violet/40 [animation-delay:1.5s]" />
          <span className="vl-pulse relative size-20">
            <span className="absolute top-3.5 left-0 size-[53px] rounded-full border-[7px] border-pink shadow-[0_0_28px_rgb(255_61_143/0.5)]" />
            <span className="absolute top-3.5 right-0 size-[53px] rounded-full border-[7px] border-violet shadow-[0_0_28px_rgb(139_92_246/0.5)] mix-blend-screen" />
          </span>
        </div>
        <h2 id="download-title" className="mt-[26px] max-w-[640px] text-[clamp(32px,4.4vw,52px)] leading-[1.05] font-bold tracking-[-0.035em]">
          Someone&apos;s waiting to meet <span className="serif text-pink-soft">you</span>
        </h2>
        <p className="mt-4 text-base text-text2">Free to download. Free to match. 18+ only.</p>
        <Cta href={site.links.android} size="xl" className="mt-[30px] shadow-[0_12px_34px_rgb(255_61_143/0.35)]">
          <Icon name="download" size={20} />
          Get {site.name} for Android
        </Cta>
      </div>
    </section>
  );
}
