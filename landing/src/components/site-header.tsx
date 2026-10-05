"use client";

import { useEffect, useState } from "react";

import { Cta } from "@/components/cta";
import { Icon } from "@/components/icon";
import { Logo } from "@/components/logo";
import { site } from "@/lib/site";

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#gifts", label: "Gifts" },
  { href: "#safety", label: "Safety" },
  { href: "#vip", label: "VIP" },
  { href: "#faq", label: "FAQ" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  // Close the phone menu on Escape or when the window grows past it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const mq = window.matchMedia("(min-width: 768px)");
    const onMq = () => mq.matches && setOpen(false);
    window.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => {
      window.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onMq);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-line-soft bg-bg/80 backdrop-blur-[20px]">
      <div className="mx-auto flex h-[68px] max-w-[1140px] items-center gap-7 px-4 sm:px-6">
        <a href="#top" aria-label="Vibe home" className="rounded-lg">
          <Logo />
        </a>
        <nav aria-label="Sections" className="hidden flex-1 justify-center gap-6 md:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="text-sm font-medium text-text2 transition-colors hover:text-text">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Cta href={site.links.android} size="sm" className="shadow-[0_8px_24px_rgb(255_61_143/0.28)]">
            Get the app
          </Cta>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid size-[42px] place-items-center rounded-full border border-line-strong text-text transition-colors hover:bg-tile md:hidden"
          >
            <Icon name={open ? "close" : "menu"} size={22} />
          </button>
        </div>
      </div>
      <nav
        id="mobile-nav"
        aria-label="Sections"
        hidden={!open}
        className="border-t border-line-soft px-4 pt-2 pb-4 md:hidden"
      >
        <ul className="flex flex-col">
          {NAV.map((n) => (
            <li key={n.href}>
              <a href={n.href} onClick={() => setOpen(false)} className="flex h-12 items-center rounded-xl px-3 text-base font-medium text-text2 transition-colors hover:bg-tile hover:text-text">
                {n.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
