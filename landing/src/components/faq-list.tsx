"use client";

import { useId, useState } from "react";

import { Icon } from "@/components/icon";
import { FAQS } from "@/lib/faqs";

/** One answer open at a time; the first starts open. Height animates via grid rows. */
export function FaqList() {
  const [open, setOpen] = useState(0);
  const base = useId();
  return (
    <ul className="mt-10 flex flex-col gap-2.5">
      {FAQS.map((f, i) => {
        const isOpen = open === i;
        const panel = `${base}-a${i}`;
        return (
          <li key={f.q} className={`overflow-hidden rounded-[18px] border bg-bg2 transition-colors duration-300 ${isOpen ? "border-white/12" : "border-line"}`}>
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panel}
                onClick={() => setOpen(isOpen ? -1 : i)}
                className="flex w-full items-center gap-3.5 px-5 py-[18px] text-left transition-colors hover:bg-white/[0.03]"
              >
                <span className="flex-1 text-[15px] font-semibold">{f.q}</span>
                <span className={`text-muted transition-transform duration-300 ease-(--ease-out-expo) ${isOpen ? "rotate-180" : ""}`}>
                  <Icon name={isOpen ? "remove" : "add"} size={22} />
                </span>
              </button>
            </h3>
            <div id={panel} role="region" aria-hidden={!isOpen} className={`grid transition-[grid-template-rows] duration-400 ease-(--ease-out-expo) ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden" inert={!isOpen}>
                <p className="max-w-[68ch] px-5 pb-[18px] text-sm leading-[1.6] text-text2">{f.a}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
