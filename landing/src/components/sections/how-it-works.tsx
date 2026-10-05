import { Icon } from "@/components/icon";
import type { IconName } from "@/lib/icons";

const STEPS: { icon: IconName; tint: string; title: string; body: string }[] = [
  { icon: "videocam", tint: "bg-pink/14 text-pink", title: "Tap Start", body: "We connect you live with someone in the world — anyone, anywhere, or filtered how you like." },
  { icon: "skip_next", tint: "bg-violet/14 text-lavender", title: "Talk, or swipe on", body: "No spark? Next takes one tap. A good one? Send a like, a gift, or keep talking as long as you both want." },
  { icon: "person_add", tint: "bg-trust/12 text-trust", title: "Stay friends", body: "Add each other and the conversation moves to chat — your matches don't have to end when the call does." },
];

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="border-t border-line-soft">
      <div className="mx-auto max-w-[1140px] px-4 py-20 sm:px-6 sm:py-[88px]">
        <p className="eyebrow text-muted">How it works</p>
        <h2 id="how-title" className="mt-3 text-[clamp(28px,3.6vw,40px)] leading-[1.08] font-bold tracking-[-0.03em]">
          Three taps from <span className="serif text-lavender">hello</span>
        </h2>
        <ol className="mt-11 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3.5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="group rounded-3xl border border-line bg-bg2 p-7 transition-colors duration-300 hover:border-white/12">
              <div className="flex items-center justify-between">
                <span className={`grid size-12 place-items-center rounded-2xl transition-transform duration-500 ease-(--ease-out-expo) group-hover:-rotate-6 group-hover:scale-105 ${s.tint}`}>
                  <Icon name={s.icon} size={24} />
                </span>
                <span aria-hidden="true" className="text-[13px] font-semibold text-faint tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-semibold tracking-[-0.3px]">{s.title}</h3>
              <p className="mt-2 text-sm leading-[1.55] text-text2">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
