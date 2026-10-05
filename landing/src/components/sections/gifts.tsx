import { Icon } from "@/components/icon";
import type { IconName } from "@/lib/icons";

const GIFTS = [
  { emoji: "🌹", name: "Rose", price: "5" },
  { emoji: "🎆", name: "Fireworks", price: "100" },
  { emoji: "🚀", name: "Rocket", price: "1,000" },
];

const PAY: { icon: IconName; name: string; note: string }[] = [
  { icon: "account_balance_wallet", name: "JazzCash & Easypaisa", note: "approve in your wallet app" },
  { icon: "credit_card", name: "Card & bank transfer", note: "in PKR" },
  { icon: "storefront", name: "Google Play & App Store", note: "in USD" },
];

const ASSURANCES: { icon?: IconName; text: string }[] = [
  { text: "Every purchase is verified with the provider before coins land" },
  { icon: "lock", text: "Payout accounts stored encrypted" },
  { icon: "verified_user", text: "Selfie check on large cash-outs" },
];

function Glow({ rgb }: { rgb: string }) {
  return <div aria-hidden="true" className="pointer-events-none absolute -top-[70px] -right-[70px] size-[220px] rounded-full" style={{ background: `radial-gradient(circle, rgb(${rgb} / 0.15), rgb(${rgb} / 0) 70%)` }} />;
}

const card = "relative overflow-hidden rounded-[28px] border p-7 transition-transform duration-500 ease-(--ease-out-expo) hover:-translate-y-1";

export function Gifts() {
  return (
    <section id="gifts" aria-labelledby="gifts-title" className="relative overflow-hidden border-t border-line-soft">
      <div aria-hidden="true" className="pointer-events-none absolute top-[40%] -left-[200px] size-[560px] rounded-full bg-[radial-gradient(circle,rgb(255_61_143/0.09),rgb(11_10_16/0)_68%)]" />
      <div className="relative mx-auto max-w-[1140px] px-4 py-20 sm:px-6 sm:py-[88px]">
        <div className="flex flex-col items-center text-center">
          <p className="eyebrow text-gold">Gifts &amp; earnings</p>
          <h2 id="gifts-title" className="mt-3 text-[clamp(28px,3.6vw,40px)] leading-[1.08] font-bold tracking-[-0.03em]">
            Make someone&apos;s night&nbsp;— <span className="serif text-gold">and get paid for yours</span>
          </h2>
          <p className="mt-3.5 max-w-[520px] text-base leading-[1.6] text-text2">
            Send a rose mid-call when the conversation is good. Every gift you receive becomes gems — and gems become real money.
          </p>
        </div>

        <div className="mt-11 grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-3.5">
          {/* Send gifts */}
          <article className={`${card} border-pink/22 bg-[linear-gradient(170deg,#1a1222_0%,#12101a_70%)]`}>
            <Glow rgb="255 61 143" />
            <h3 className="relative text-lg font-semibold tracking-[-0.3px]">Send gifts live, mid-call</h3>
            <p className="relative mt-2 text-sm leading-[1.55] text-text2">From a 5-coin rose to a 1,000-coin rocket — gifts land on screen with full-screen effects both of you see.</p>
            <ul className="relative mt-[22px] grid grid-cols-3 gap-2.5">
              {GIFTS.map((g) => (
                <li key={g.name} className="group/gift flex flex-col items-center gap-1.5 rounded-[18px] border border-line bg-tile px-2 py-3.5">
                  <span aria-hidden="true" className="text-[30px] leading-none transition-transform duration-500 ease-(--ease-out-expo) group-hover/gift:-translate-y-1 group-hover/gift:scale-115">
                    {g.emoji}
                  </span>
                  <span className="text-xs font-semibold">{g.name}</span>
                  <span className="flex items-center gap-1 text-[11.5px] font-bold text-gold tabular-nums">
                    <span aria-hidden="true" className="coin block size-[11px]" />
                    {g.price}
                    <span className="sr-only"> coins</span>
                  </span>
                </li>
              ))}
            </ul>
          </article>

          {/* Cash out */}
          <article className={`${card} border-trust/22 bg-[linear-gradient(170deg,#0f1a18_0%,#12101a_70%)]`}>
            <Glow rgb="94 234 212" />
            <h3 className="relative text-lg font-semibold tracking-[-0.3px]">Gifts become gems. Gems become cash.</h3>
            <p className="relative mt-2 text-sm leading-[1.55] text-text2">
              You keep 50% of every gift&apos;s value as gems. Cash out to your JazzCash or Easypaisa wallet — paid in minutes — or by bank transfer (IBAN).
            </p>
            <div aria-label="Example wallet" role="group" className="relative mt-[22px] rounded-[20px] border border-line bg-tile p-[18px]">
              <div className="flex items-center gap-2">
                <Icon name="diamond" size={20} className="text-trust" />
                <span className="text-[13px] text-muted">Your gems</span>
              </div>
              <div className="mt-2 flex flex-wrap items-baseline gap-2.5">
                <span className="text-[32px] font-bold tracking-[-1px] text-trust tabular-nums">12,840</span>
                <span className="text-sm text-text2">≈ $64.20</span>
              </div>
              <div aria-hidden="true" className="mt-3.5 flex h-11 items-center justify-center gap-2 rounded-full bg-trust text-sm font-bold text-on-gem">
                <Icon name="account_balance_wallet" size={18} />
                Cash out
              </div>
            </div>
          </article>

          {/* Coins */}
          <article className={`${card} border-gold/22 bg-[linear-gradient(170deg,#1c1710_0%,#12101a_70%)]`}>
            <Glow rgb="255 200 87" />
            <h3 className="relative text-lg font-semibold tracking-[-0.3px]">Coins, earned or bought</h3>
            <p className="relative mt-2 text-sm leading-[1.55] text-text2">Daily check-ins, invites and your profile pay out free coins. Packs start at $0.99 — and coins never expire. Pay your way:</p>
            <ul className="relative mt-[22px] flex flex-col gap-[9px]">
              {PAY.map((p) => (
                <li key={p.name} className="flex items-center gap-2.5 rounded-[15px] border border-line bg-tile px-3.5 py-[11px]">
                  <Icon name={p.icon} size={18} className="text-gold" />
                  <span className="flex-1 text-[13.5px] font-medium">{p.name}</span>
                  <span className="text-right text-[11.5px] font-semibold text-muted">{p.note}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>

        <ul className="mt-[22px] flex flex-wrap items-center justify-center gap-x-[26px] gap-y-2.5 text-center">
          {ASSURANCES.map((a) => (
            <li key={a.text} className="flex items-center gap-1.5 text-xs text-muted">
              {a.icon && <Icon name={a.icon} size={15} className="text-trust" />}
              {a.text}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
