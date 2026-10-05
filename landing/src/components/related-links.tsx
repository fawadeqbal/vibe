import { Icon } from "@/components/icon";
import { linkInfo } from "@/content";

export function RelatedLinks({ paths, title = "Keep reading" }: { paths: string[]; title?: string }) {
  const items = paths.map(linkInfo).filter((x) => x !== null);
  if (!items.length) return null;
  return (
    <section aria-labelledby="related-title" className="mt-16">
      <h2 id="related-title" className="text-[clamp(23px,2.6vw,28px)] font-bold tracking-[-0.02em]">{title}</h2>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {items.map((it) => (
          <li key={it.href}>
            <a href={it.href} className="group flex h-full flex-col rounded-[22px] border border-line bg-bg2 p-5 transition-colors duration-300 hover:border-white/14">
              <span className="eyebrow text-text2">{it.kind}</span>
              <span className="mt-2 flex-1 text-[15.5px] leading-snug font-semibold">{it.title}</span>
              <span className="mt-4 flex items-center gap-1 text-[13px] font-semibold text-pink-soft">
                Read more
                <Icon name="arrow_outward" size={16} className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
