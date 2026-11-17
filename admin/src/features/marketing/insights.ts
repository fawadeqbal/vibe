import type { InsightCounts, InsightRow, MarketingInsights } from "@/lib/api/types";
import { format } from "@/lib/format";

import { countryName, sourceLabel } from "./labels";

/**
 * Marketing insights, the pure part: what each measure is, how a split's
 * rows are named, the one-line takeaway under the playground and the three
 * "what matters" cards. Rates divide visits (as on Marketing site), so no
 * rate passes 100%.
 */

export type Measure = "visitors" | "signups" | "rate" | "met" | "paid" | "revenue";
export type Split = "region" | "channel" | "device" | "hour";

export const MEASURES: { id: Measure; label: string; rate: boolean; color: string }[] = [
  { id: "visitors", label: "Visitors", rate: false, color: "bg-primary" },
  { id: "signups", label: "Sign-ups", rate: false, color: "bg-trust" },
  { id: "rate", label: "Visit → sign-up", rate: true, color: "bg-money" },
  { id: "met", label: "Met a real person", rate: true, color: "bg-info" },
  { id: "paid", label: "Paid", rate: false, color: "bg-pink" },
  { id: "revenue", label: "Revenue", rate: false, color: "bg-money" },
];
export const SPLITS: { id: Split; label: string; short: string }[] = [
  { id: "region", label: "Region", short: "Region" },
  { id: "channel", label: "Channel", short: "Channel" },
  { id: "device", label: "Device", short: "Device" },
  { id: "hour", label: "Hour of day", short: "Hour" },
];
export const measureOf = (id: Measure) => MEASURES.find((m) => m.id === id)!;

/** Under this many visits a row's rates are shown but flagged "few visits", and kept out of the takeaways. */
export const FEW_VISITS = 100;
/** Sign-ups a row needs before its "met a real person" rate is compared. */
export const FEW_SIGNUPS = 20;

const pct = (n: number, of: number) => (of > 0 ? (n / of) * 100 : 0);

export function value(c: InsightCounts, m: Measure): number {
  switch (m) {
    case "visitors":
      return c.visitors;
    case "signups":
      return c.signups;
    case "rate":
      return pct(c.signups, c.visits);
    case "met":
      return pct(c.firstCalls, c.signups);
    case "paid":
      return c.paid;
    case "revenue":
      return c.revenueCents / 100;
  }
}

export function show(x: number, m: Measure): string {
  if (m === "rate") return `${x.toFixed(1)}%`;
  if (m === "met") return `${Math.round(x)}%`;
  if (m === "revenue") return format.usdRound(x);
  return format.number(Math.round(x));
}

/** % change on the window before; null when there was nothing before. */
export function change(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

/** "+14%", "−6%", "0%" (a real minus sign, so the sign reads without the colour). */
export const signed = (n: number, unit = "%") => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}${unit}`;

export function rowName(split: Split | "country", key: string): string {
  if (split === "channel") return key === "direct" ? "Direct" : sourceLabel(key);
  if (split === "hour") return `${key}:00`;
  if (split === "country") return countryName(key);
  return key;
}

export const rowsOf = (r: MarketingInsights, s: Split): InsightRow[] =>
  s === "region" ? r.regions : s === "channel" ? r.channels : s === "device" ? r.devices : r.hours;

/** Rows with enough behind them to compare a rate fairly. */
export function enough(row: InsightCounts, m: Measure): boolean {
  if (m === "met") return row.signups >= FEW_SIGNUPS;
  return row.visits >= FEW_VISITS;
}

/** "UTC+5" / "UTC−3:30". */
export function tzLabel(offsetMinutes: number): string {
  if (!offsetMinutes) return "UTC";
  const h = Math.floor(Math.abs(offsetMinutes) / 60);
  const m = Math.abs(offsetMinutes) % 60;
  return `UTC${offsetMinutes > 0 ? "+" : "−"}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

export const periodWord = (days: number) => (days === 1 ? "today" : days === 7 ? "this week" : days === 30 ? "this month" : `in the last ${days} days`);
export const beforeWord = (days: number) => (days === 1 ? "the day before" : `the ${days} days before`);

/** A sentence in parts; `b` parts are names shown in bold. */
export type Says = (string | { b: string })[];
export const plain = (s: Says) => s.map((p) => (typeof p === "string" ? p : p.b)).join("");

const best = <T>(xs: T[], by: (x: T) => number) => xs.reduce<T | undefined>((a, x) => (a === undefined || by(x) > by(a) ? x : a), undefined);
const worst = <T>(xs: T[], by: (x: T) => number) => best(xs, (x) => -by(x));

/** The one-line read of the playground's current view. */
export function takeaway(r: MarketingInsights, split: Split, m: Measure): Says {
  const rows = rowsOf(r, split);
  const name = (row: InsightRow) => ({ b: rowName(split, row.key) });
  const label = measureOf(m).label.toLowerCase();
  const noun = SPLITS.find((s) => s.id === split)!.label.toLowerCase();
  if (!rows.some((row) => value(row, m) > 0)) return [`No ${label} ${periodWord(r.days)} yet.`];

  if (split === "hour") {
    if (measureOf(m).rate) {
      const ok = rows.filter((row) => enough(row, m));
      const hi = best(ok, (row) => value(row, m));
      const lo = worst(ok, (row) => value(row, m));
      if (!hi || !lo) return [`Too few ${m === "met" ? "sign-ups" : "visits"} in any one hour to compare ${label} yet.`];
      if (ok.length === 1) return [name(hi), ` is the only hour with enough ${m === "met" ? "sign-ups" : "visits"}: ${show(value(hi, m), m)}.`];
      if (value(hi, m) - value(lo, m) < (m === "met" ? 5 : 1)) return [`Every hour is close: ${show(value(lo, m), m)} to ${show(value(hi, m), m)} of ${m === "met" ? "sign-ups meet a real person" : "visits end in a sign-up"}.`];
      return m === "met"
        ? ["Sign-ups at ", name(hi), ` meet a real person most often (${show(value(hi, m), m)}); at `, name(lo), ` only ${show(value(lo, m), m)} do.`]
        : ["Visits at ", name(hi), ` turn into sign-ups most often (${show(value(hi, m), m)}), against ${show(value(lo, m), m)} at `, name(lo), "."];
    }
    // The busiest four hours in a row (around midnight too).
    const v = rows.map((row) => value(row, m));
    const total = v.reduce((a, x) => a + x, 0);
    let start = 0;
    let top = -1;
    for (let h = 0; h < 24; h++) {
      const sum = v[h] + v[(h + 1) % 24] + v[(h + 2) % 24] + v[(h + 3) % 24];
      if (sum > top) [top, start] = [sum, h];
    }
    const at = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;
    return [{ b: `${at(start)} to ${at(start + 4)}` }, ` brings ${Math.round(pct(top, total))}% of ${label} (${tzLabel(r.tzOffsetMinutes)}). Post and run Vibe Hour then.`];
  }

  const top = best(rows, (row) => value(row, m))!;
  if (m === "visitors" || m === "signups") {
    const total = rows.reduce((a, row) => a + value(row, m), 0);
    const growing = best(
      rows.filter((row) => value(row, m) >= 20 && value(row.before, m) > 0),
      (row) => change(value(row, m), value(row.before, m)) ?? -Infinity,
    );
    const g = growing ? change(value(growing, m), value(growing.before, m)) : null;
    const lead: Says = [name(top), ` brings ${Math.round(pct(value(top, m), total))}% of ${label}.`];
    return g !== null && g > 0 ? [...lead, " Fastest growing: ", name(growing!), `, ${signed(g)} on ${beforeWord(r.days)}.`] : lead;
  }
  if (m === "rate" || m === "met") {
    const ok = rows.filter((row) => enough(row, m));
    const hi = best(ok, (row) => value(row, m));
    const lo = worst(ok, (row) => value(row, m));
    if (!hi || !lo) return [`Too few ${m === "met" ? "sign-ups" : "visits"} in any ${noun} to compare yet.`];
    if (ok.length === 1) return [name(hi), ` is the only ${noun} with enough ${m === "met" ? "sign-ups" : "visits"}: ${show(value(hi, m), m)}.`];
    if (m === "rate") {
      const x = value(lo, m) > 0 ? value(hi, m) / value(lo, m) : null;
      if (value(hi, m) - value(lo, m) < 1) return [`Every ${noun} is close: ${show(value(lo, m), m)} to ${show(value(hi, m), m)} of visits end in a sign-up.`];
      return x
        ? [name(hi), ` turns ${show(value(hi, m), m)} of visits into sign-ups, ${x.toFixed(1)}× `, name(lo), ". More of that traffic pays off most."]
        : [name(hi), ` turns ${show(value(hi, m), m)} of visits into sign-ups; none from `, name(lo), " sign up."];
    }
    if (value(hi, m) - value(lo, m) < 5) return [`Every ${noun} is close: ${show(value(lo, m), m)} to ${show(value(hi, m), m)} of sign-ups meet a real person.`];
    return [`Only ${show(value(lo, m), m)} of sign-ups from `, name(lo), ` meet a real person, against ${show(value(hi, m), m)} from `, name(hi), ". Those people leave before they see what Vibe is."];
  }
  // Paid and revenue: who brings the most, and who earns the most per visitor.
  const ok = rows.filter((row) => row.visits >= FEW_VISITS);
  const per = best(ok, (row) => (row.visitors ? value(row, m) / row.visitors : 0));
  const lead: Says = m === "paid" ? [name(top), ` has the most paying users (${show(value(top, m), m)}).`] : [name(top), ` brings the most money (${show(value(top, m), m)}).`];
  if (!per || !per.visitors || value(per, m) <= 0) return lead;
  const k = (value(per, m) / per.visitors) * 1000;
  return m === "paid"
    ? [...lead, " Paid per 1,000 visitors is highest in ", name(per), ` (${k.toFixed(1)}).`]
    : [...lead, " Per 1,000 visitors ", name(per), ` earns ${format.usdRound(k)}, the most of any ${noun}.`];
}

export interface Finding {
  tone: "idea" | "good" | "bad";
  title: string;
  text: string;
  action: { label: string; measure: Measure; split: Split };
}
export const TONE_LABEL: Record<Finding["tone"], string> = { idea: "Opportunity", good: "Working", bad: "Losing people" };

const sumOf = (rows: InsightCounts[]) =>
  rows.reduce(
    (a, x) => ({ visitors: a.visitors + x.visitors, visits: a.visits + x.visits, clicked: a.clicked + x.clicked, signups: a.signups + x.signups, firstCalls: a.firstCalls + x.firstCalls, paid: a.paid + x.paid, revenueCents: a.revenueCents + x.revenueCents }),
    { visitors: 0, visits: 0, clicked: 0, signups: 0, firstCalls: 0, paid: 0, revenueCents: 0 },
  );

/** A smaller group that converts much better than the biggest one. */
function opportunity(r: MarketingInsights, split: "region" | "channel"): Finding | null {
  const rows = rowsOf(r, split).filter((row) => row.visits >= FEW_VISITS && row.key !== "Unknown");
  const biggest = best(rows, (row) => row.visitors);
  const hi = best(rows, (row) => value(row, "rate"));
  if (!biggest || !hi || hi === biggest || value(biggest, "rate") <= 0) return null;
  const x = value(hi, "rate") / value(biggest, "rate");
  const share = pct(hi.visitors, r.totals.visitors);
  if (x < 1.5 || share >= 25) return null;
  const a = rowName(split, hi.key);
  const b = rowName(split, biggest.key);
  return {
    tone: "idea",
    title: `${a} converts ${x.toFixed(1)}× better than ${b}`,
    text: `${show(value(hi, "rate"), "rate")} of visits from ${a} end in a sign-up, against ${show(value(biggest, "rate"), "rate")} from ${b}. Only ${Math.round(share)}% of visitors come from there.`,
    action: { label: split === "region" ? "Compare regions" : "Compare channels", measure: "rate", split },
  };
}

/** A group whose visitors grew fast. */
function growing(r: MarketingInsights, split: "channel" | "region"): Finding | null {
  const rows = rowsOf(r, split).filter((row) => row.visitors >= 50 && row.before.visitors >= 20);
  const g = best(rows, (row) => change(row.visitors, row.before.visitors) ?? -Infinity);
  const c = g ? change(g.visitors, g.before.visitors) : null;
  if (!g || c === null || c < 20) return null;
  const a = rowName(split, g.key);
  return {
    tone: "good",
    title: `${a} visits are up ${c}%`,
    text: `${format.number(g.visitors)} visitors and ${format.number(g.signups)} sign-ups, ${Math.round(pct(g.signups, r.totals.signups))}% of all sign-ups.`,
    action: { label: split === "channel" ? `Channels by visitors` : "Regions by visitors", measure: "visitors", split },
  };
}

/** Where the most sign-ups come from (when nothing grew enough to call out). */
function biggestSource(r: MarketingInsights): Finding | null {
  const top = best(r.channels, (row) => row.signups);
  if (!top || top.signups < 10) return null;
  const a = rowName("channel", top.key);
  return {
    tone: "good",
    title: `${a} brings the most sign-ups`,
    text: `${format.number(top.signups)} sign-ups, ${Math.round(pct(top.signups, r.totals.signups))}% of all, from ${show(value(top, "rate"), "rate")} of its visits.`,
    action: { label: "Channels by sign-ups", measure: "signups", split: "channel" },
  };
}

/** Sign-ups in the small hours that never meet anyone. */
function lateNight(r: MarketingInsights): Finding | null {
  const night = sumOf(r.hours.filter((h) => Number(h.key) < 6));
  const all = value(r.totals, "met");
  const n = value(night, "met");
  if (night.signups < FEW_SIGNUPS || all - n < 15) return null;
  return {
    tone: "bad",
    title: "Most sign-ups after midnight never meet anyone",
    text: `Sign-ups between 00:00 and 06:00 (${tzLabel(r.tzOffsetMinutes)}) had a first call only ${show(n, "met")} of the time (${show(all, "met")} overall): nobody is online.`,
    action: { label: "Sign-ups by hour", measure: "met", split: "hour" },
  };
}

/** A channel whose sign-ups meet a real person much less often than the rest. */
function lonelyChannel(r: MarketingInsights): Finding | null {
  const all = value(r.totals, "met");
  const lo = worst(r.channels.filter((row) => row.signups >= FEW_SIGNUPS), (row) => value(row, "met"));
  if (!lo || all - value(lo, "met") < 10) return null;
  const a = rowName("channel", lo.key);
  return {
    tone: "bad",
    title: `Only ${show(value(lo, "met"), "met")} of sign-ups from ${a} meet a real person`,
    text: `Against ${show(all, "met")} overall. They leave before they see what Vibe is.`,
    action: { label: "Channels by first call", measure: "met", split: "channel" },
  };
}

/** A channel that lost a lot of visitors. */
function shrinking(r: MarketingInsights): Finding | null {
  const lo = worst(r.channels.filter((row) => row.before.visitors >= 50), (row) => change(row.visitors, row.before.visitors) ?? 0);
  const c = lo ? change(lo.visitors, lo.before.visitors) : null;
  if (!lo || c === null || c > -20) return null;
  const a = rowName("channel", lo.key);
  return {
    tone: "bad",
    title: `${a} visits are down ${Math.abs(c)}%`,
    text: `${format.number(lo.visitors)} visitors, against ${format.number(lo.before.visitors)} in ${beforeWord(r.days)}.`,
    action: { label: "Channels by visitors", measure: "visitors", split: "channel" },
  };
}

/** Up to three cards: an opportunity, what's working, where people are lost; each only when the numbers say so. */
export function findings(r: MarketingInsights): Finding[] {
  const idea = opportunity(r, "region") ?? opportunity(r, "channel");
  const good = growing(r, "channel") ?? growing(r, "region") ?? biggestSource(r);
  const bad = lateNight(r) ?? lonelyChannel(r) ?? shrinking(r);
  return [idea, good, bad].filter((f): f is Finding => f !== null);
}

/** The five numbers at the top. `good` says which way is better; rates change in points. */
export function glance(r: MarketingInsights) {
  const t = r.totals;
  const p = r.previous;
  const lost = (c: InsightCounts) => pct(c.visits - c.clicked, c.visits);
  const pts = (a: number, b: number, has: boolean) => (has ? Math.round(a - b) : null);
  const today = r.daily.at(-1);
  const spark = (f: (c: InsightCounts) => number) => r.daily.map(f);
  return [
    { id: "visitors", label: "Visitors", value: format.compact(t.visitors), change: change(t.visitors, p.visitors), unit: "%", good: true, sub: `${format.number(today?.visitors ?? 0)} today`, color: "text-primary", spark: spark((d) => d.visitors) },
    { id: "signups", label: "Sign-ups", value: format.number(t.signups), change: change(t.signups, p.signups), unit: "%", good: true, sub: `${show(value(t, "rate"), "rate")} of visits`, color: "text-trust", spark: spark((d) => d.signups) },
    { id: "met", label: "Met a real person", value: show(value(t, "met"), "met"), change: pts(value(t, "met"), value(p, "met"), p.signups > 0 && t.signups > 0), unit: " pts", good: true, sub: "of sign-ups had a first call", color: "text-info", spark: spark((d) => value(d, "met")) },
    { id: "paid", label: "Paid", value: format.number(t.paid), change: change(t.paid, p.paid), unit: "%", good: true, sub: `${format.usdRound(t.revenueCents / 100)} · ${t.signups ? format.usd(t.revenueCents / 100 / t.signups) : "—"} per sign-up`, color: "text-money", spark: spark((d) => d.paid) },
    { id: "lost", label: "Lost before the app", value: `${Math.round(lost(t))}%`, change: pts(lost(t), lost(p), p.visits > 0 && t.visits > 0), unit: " pts", good: false, sub: "of visits never clicked to the app", color: "text-bad", spark: spark((d) => (d.visits ? lost(d) : NaN)) },
  ];
}

/** Every split as CSV rows, for Export. */
export function toCsv(r: MarketingInsights): string {
  const cols = ["visitors", "visits", "clicked", "signups", "firstCalls", "paid", "revenueCents"] as const;
  const head = ["split", "key", "name", ...cols, ...cols.map((c) => `before_${c}`)];
  const line = (split: string, row: InsightRow, name: string) => [split, row.key, name, ...cols.map((c) => row[c]), ...cols.map((c) => row.before[c])];
  const esc = (v: string | number) => (typeof v === "number" ? String(v) : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const out: (string | number)[][] = [head];
  out.push(["total", "all", "All visits", ...cols.map((c) => r.totals[c]), ...cols.map((c) => r.previous[c])]);
  for (const g of r.regions) {
    out.push(line("region", g, g.key));
    for (const c of g.countries) out.push(line("country", c, countryName(c.key)));
  }
  for (const s of ["channel", "device", "hour"] as const) for (const row of rowsOf(r, s)) out.push(line(s, row, rowName(s, row.key)));
  return out.map((l) => l.map(esc).join(",")).join("\n") + "\n";
}
