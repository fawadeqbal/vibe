import { Inline } from "@/components/prose";
import type { Faq } from "@/content/types";

/** FAQ as native <details>: works without JS, every answer is in the HTML for crawlers. */
export function FaqStatic({ faqs, title = "Frequently asked questions" }: { faqs: Faq[]; title?: string }) {
  if (!faqs.length) return null;
  return (
    <section aria-labelledby="faq-title" className="mt-16">
      <h2 id="faq-title" className="text-[clamp(23px,2.6vw,28px)] font-bold tracking-[-0.02em]">{title}</h2>
      <div className="mt-6 flex flex-col gap-2.5">
        {faqs.map((f, i) => (
          <details key={f.q} open={i === 0} className="group overflow-hidden rounded-[18px] border border-line bg-bg2 open:border-white/12">
            <summary className="flex cursor-pointer list-none items-center gap-3.5 px-5 py-[18px] transition-colors hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden">
              <h3 className="flex-1 text-[15px] font-semibold">{f.q}</h3>
              <span aria-hidden="true" className="text-xl leading-none text-muted transition-transform duration-300 group-open:rotate-45">+</span>
            </summary>
            <p className="max-w-[68ch] px-5 pb-[18px] text-[15px] leading-[1.65] text-text2"><Inline text={f.a} /></p>
          </details>
        ))}
      </div>
    </section>
  );
}
