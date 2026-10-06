import type { RuleField, RuleValue } from "@/lib/api/types";
import { format } from "@/lib/format";

/** Unit shown next to a rule's input. */
export const UNIT: Record<RuleField["kind"], { prefix?: string; suffix?: string }> = {
  coins: { suffix: "coins" },
  count: {},
  seconds: { suffix: "sec" },
  minutes: { suffix: "min" },
  hours: { suffix: "hours" },
  gems: { suffix: "gems" },
  cents: { prefix: "$" },
  share: { suffix: "%" },
  age: { suffix: "years" },
  days7: { suffix: "coins" },
  clock: { suffix: "HH:MM" },
};

/** Minutes after midnight → "21:00". */
export const clockText = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** "21:00" / "9:30" → minutes after midnight; null when it is not a time of day. */
export function parseClock(raw: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 4 })}`;

/** A rule value for reading. */
export function showRule(f: RuleField, v: RuleValue | undefined): string {
  if (v === undefined) return "—";
  if (Array.isArray(v)) return v.map((n) => format.number(n)).join(" · ");
  switch (f.kind) {
    case "share":
      return format.percent(v);
    case "cents":
      return dollars(v);
    case "coins":
      return `${format.number(v)} coins`;
    case "gems":
      return `${format.number(v)} gems`;
    case "seconds":
      return `${format.number(v)} sec`;
    case "minutes":
      return `${format.number(v)} min`;
    case "hours":
      return `${format.number(v)} ${v === 1 ? "hour" : "hours"}`;
    case "age":
      return `${v} years`;
    case "clock":
      return clockText(v);
    default:
      return format.number(v);
  }
}

/** Server value → what the input shows (shares as %, cents as dollars). */
export function toInput(f: RuleField, v: number): string {
  if (f.kind === "share") return String(+(v * 100).toFixed(2));
  if (f.kind === "cents") return String(+(v / 100).toFixed(6));
  if (f.kind === "clock") return clockText(v);
  return String(v);
}

/** Input text → server value, or an error message. */
export function fromInput(f: RuleField, raw: string, label = f.label): { value?: number; error?: string } {
  const t = raw.trim();
  if (!t) return { error: `${label} is required` };
  if (f.kind === "clock") {
    const minutes = parseClock(t);
    if (minutes === null || minutes < f.min || minutes > f.max) return { error: `${label}: a time like 21:00` };
    return { value: minutes };
  }
  let n = Number(t);
  if (!Number.isFinite(n)) return { error: `${label}: enter a number` };
  if (f.kind === "share") n = +(n / 100).toFixed(4);
  else if (f.kind === "cents") n = +(n * 100).toFixed(4);
  else if (!Number.isInteger(n)) return { error: `${label}: whole numbers only` };
  const lo = f.min;
  const hi = f.max;
  if (n < lo || n > hi) {
    const show = (x: number) => (f.kind === "share" ? `${x * 100}%` : f.kind === "cents" ? dollars(x) : format.number(x));
    return { error: `${label}: between ${show(lo)} and ${show(hi)}` };
  }
  return { value: n };
}

export const usd = (cents: number) => format.cents(cents);

/** "Big spender" → "big_spender" (store product ids). */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
