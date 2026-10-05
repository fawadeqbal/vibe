import { Icon } from "@/components/icon";
import { site } from "@/lib/site";
import { SafetyToggles } from "@/components/safety-toggles";
import type { IconName } from "@/lib/icons";

const POINTS: { icon: IconName; title: string; body: string }[] = [
  { icon: "verified", title: "Selfie-verified profiles", body: "A quick selfie check proves there's a real person behind every verified badge — and you can match with verified people only." },
  { icon: "blur_on", title: "Calls start blurred", body: "Both videos stay soft for the first seconds, so nobody is caught off guard." },
  { icon: "flag", title: "Report in two taps, during or after", body: "The report button never leaves the screen, and reports are reviewed around the clock. 18+ only, always." },
];

export function Safety() {
  return (
    <section id="safety" aria-labelledby="safety-title" className="relative overflow-hidden border-t border-line-soft">
      <div aria-hidden="true" className="pointer-events-none absolute -top-[120px] -right-[180px] size-[560px] rounded-full bg-[radial-gradient(circle,rgb(94_234_212/0.08),rgb(11_10_16/0)_68%)]" />
      <div className="relative mx-auto flex max-w-[1140px] flex-wrap items-center gap-14 px-4 py-20 sm:px-6 sm:py-[88px]">
        <div className="min-w-0 flex-[1_1_420px]">
          <p className="eyebrow text-trust">Safety first</p>
          <h2 id="safety-title" className="mt-3 text-[clamp(28px,3.6vw,40px)] leading-[1.08] font-bold tracking-[-0.03em]">
            Built so you never have to <span className="serif text-trust">think twice</span>
          </h2>
          <p className="mt-4 max-w-[440px] text-base leading-[1.6] text-text2">Video with strangers only works when it feels safe. Every call on {site.name} comes with guardrails on by default.</p>
          <ul className="mt-7 flex flex-col gap-[18px]">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-trust/12 text-trust">
                  <Icon name={p.icon} size={20} />
                </span>
                <div>
                  <h3 className="text-[15px] font-semibold">{p.title}</h3>
                  <p className="mt-[3px] max-w-[460px] text-[13.5px] leading-normal text-text2">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex min-w-0 flex-[1_1_360px] justify-center">
          <div className="w-[min(400px,100%)] rounded-[28px] border border-trust/20 bg-bg2 p-7 shadow-[0_30px_80px_rgb(0_0_0/0.35)]">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-[14px] bg-trust/12 text-trust">
                <Icon name="shield" size={24} />
              </span>
              <div>
                <p className="text-base font-semibold">On by default</p>
                <p className="text-[12.5px] text-muted">You opt out, not in</p>
              </div>
            </div>
            <SafetyToggles />
          </div>
        </div>
      </div>
    </section>
  );
}
