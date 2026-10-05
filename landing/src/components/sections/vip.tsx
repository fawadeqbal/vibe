import { Cta } from "@/components/cta";
import { Icon } from "@/components/icon";
import type { IconName } from "@/lib/icons";
import { site } from "@/lib/site";

const PERKS: { icon: IconName; label: string }[] = [
  { icon: "tune", label: "Unlimited filters" },
  { icon: "block", label: "No ads" },
  { icon: "favorite", label: "See who liked you" },
  { icon: "bolt", label: "Priority matching" },
  { icon: "paid", label: "200 coins / month" },
];

export function Vip() {
  return (
    <section id="vip" aria-labelledby="vip-title" className="relative overflow-hidden border-t border-line-soft">
      <div aria-hidden="true" className="pointer-events-none absolute top-0 left-1/2 h-[420px] w-[760px] -translate-x-1/2 bg-[radial-gradient(60%_70%_at_50%_0%,rgb(255_200_87/0.1),rgb(11_10_16/0)_70%)]" />
      <div className="relative mx-auto flex max-w-[1140px] flex-col items-center px-4 py-20 text-center sm:px-6 sm:py-[88px]">
        <span className="bg-gold-grad grid size-14 place-items-center rounded-[18px] text-on-gold-icon shadow-[0_14px_36px_rgb(240_160_32/0.28)]">
          <Icon name="workspace_premium" size={30} />
        </span>
        <h2 id="vip-title" className="mt-5 text-[clamp(28px,3.6vw,40px)] leading-[1.08] font-bold tracking-[-0.03em]">
          Vibe <span className="serif text-gold">VIP</span>
        </h2>
        <p className="mt-3.5 max-w-[480px] text-base leading-[1.6] text-text2">Everything the free app holds back — free filters, no ads, priority matching, 200 coins a month and seeing who liked you.</p>
        <ul className="mt-9 flex w-full max-w-[880px] flex-wrap justify-center gap-3">
          {PERKS.map((p) => (
            <li key={p.label} className="flex w-[calc(50%-6px)] flex-col items-center gap-2 rounded-[20px] sm:w-[calc(33.333%-8px)] lg:w-auto lg:flex-1 border border-line bg-bg2 px-4 py-5 transition-colors duration-300 hover:border-gold/30">
              <Icon name={p.icon} size={22} className="text-gold" />
              <span className="text-[13.5px] font-semibold">{p.label}</span>
            </li>
          ))}
        </ul>
        <div className="mt-[30px] flex flex-wrap items-center justify-center gap-3.5">
          <Cta href={site.links.webApp} variant="gold" className="h-[52px] text-[15px]">
            Start 3-day free trial
          </Cta>
          <span className="text-[13px] text-muted">from $2.99 · nothing charged today · cancel any time</span>
        </div>
      </div>
    </section>
  );
}
