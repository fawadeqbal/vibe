"use client";

import { useState } from "react";

const DEFAULTS = ["Blur the first 3 seconds", "Verified people only", "Hide my city"];

/** The app's safety switches, on by default. They flip, so the point lands by hand. */
export function SafetyToggles() {
  const [on, setOn] = useState(() => DEFAULTS.map(() => true));
  return (
    <ul className="mt-[22px] flex flex-col gap-3">
      {DEFAULTS.map((label, i) => (
        <li key={label}>
          <button
            type="button"
            role="switch"
            aria-checked={on[i]}
            onClick={() => setOn((v) => v.map((x, j) => (j === i ? !x : x)))}
            className="flex w-full items-center gap-2.5 rounded-2xl bg-tile px-4 py-[13px] text-left transition-colors hover:bg-white/[0.06]"
          >
            <span className="flex-1 text-sm font-medium">{label}</span>
            <span aria-hidden="true" className={`relative h-[26px] w-11 shrink-0 rounded-full transition-colors duration-300 ${on[i] ? "bg-trust" : "bg-white/14"}`}>
              <span className={`absolute top-[3px] size-5 rounded-full transition-[left,background-color] duration-300 ease-(--ease-out-expo) ${on[i] ? "left-[21px] bg-bg" : "left-[3px] bg-text2"}`} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
