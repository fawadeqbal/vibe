import type { MarketingReport, MarketingTotals } from "@/lib/api/types";

import { DEFINITIONS } from "./definitions";
import { BUTTON_LABELS, buttonLabel, sourceLabel } from "./labels";

/**
 * Turns the marketing report into plain answers: the visit → first-call
 * steps with where people are lost, a verdict per channel, and up to three
 * notes. Pure, so it is unit-tested.
 */

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "—");

export interface Step {
  key: "visits" | "clicked" | "signups" | "firstCall" | "goodFirstCall" | "paid";
  label: string;
  value: number;
  /** "78% of visits" — always the same unit as the value. */
  rate: string;
  /** What the step counts (shown on hover). */
  hint: string;
  /** vs the period before: "new", "▲ 20%", "▼ 5%", "same", or "" when both are 0. */
  delta: { text: string; tone: "ok" | "bad" | "muted" };
  /** Lost before the next step ("−4"); null after the last one. */
  lostAfter: number | null;
  /** The biggest loss of the journey. */
  worst: boolean;
}

export function delta(now: number, before: number): Step["delta"] {
  if (before <= 0) return now > 0 ? { text: "new", tone: "ok" } : { text: "", tone: "muted" };
  const d = (now - before) / before;
  if (Math.abs(d) < 0.005) return { text: "same as before", tone: "muted" };
  return { text: `${d > 0 ? "▲" : "▼"} ${Math.round(Math.abs(d) * 100)}% vs before`, tone: d > 0 ? "ok" : "bad" };
}

/**
 * Visits → clicked → signed up (nested, all counted in visits), then what
 * those sign-ups did: a call, a good first call (60 s+), paying — each a share
 * of the sign-ups, not of the step before (someone can pay without a good
 * call). Every rate divides like by like, so none can pass 100%.
 */
export function journey(t: MarketingTotals, p: MarketingTotals): Step[] {
  const raw: Omit<Step, "worst" | "lostAfter">[] = [
    { key: "visits", label: "Visits", value: t.visits, rate: `${format(t.visitors)} ${t.visitors === 1 ? "browser" : "browsers"}`, hint: DEFINITIONS.visits, delta: delta(t.visits, p.visits) },
    { key: "clicked", label: "Clicked to the app", value: t.clickedVisits, rate: `${pct(t.clickedVisits, t.visits)} of visits`, hint: DEFINITIONS.clicked, delta: delta(t.clickedVisits, p.clickedVisits) },
    { key: "signups", label: "Signed up", value: t.signups, rate: `${pct(t.signups, t.visits)} of visits`, hint: DEFINITIONS.signups, delta: delta(t.signups, p.signups) },
    { key: "firstCall", label: "Had a call", value: t.firstCalls, rate: `${pct(t.firstCalls, t.signups)} of sign-ups`, hint: DEFINITIONS.firstCall, delta: delta(t.firstCalls, p.firstCalls) },
    { key: "goodFirstCall", label: "Good first call", value: t.goodFirstCall, rate: `${pct(t.goodFirstCall, t.signups)} of sign-ups`, hint: DEFINITIONS.goodFirstCall, delta: delta(t.goodFirstCall, p.goodFirstCall) },
    { key: "paid", label: "Paid", value: t.paid, rate: `${pct(t.paid, t.signups)} of sign-ups`, hint: DEFINITIONS.paid, delta: delta(t.paid, p.paid) },
  ];
  const steps = raw.map((s, i) => ({ ...s, lostAfter: i < raw.length - 1 ? Math.max(0, s.value - raw[i + 1].value) : null }));
  // The step people didn't reach after the biggest loss. "Paid" is left out:
  // most people never pay, so it would always win and say nothing new.
  let worst: Step["key"] | null = null;
  let most = 0;
  for (let i = 0; i < steps.length - 2; i++) {
    const lost = steps[i].lostAfter ?? 0;
    if (lost > most) {
      most = lost;
      worst = steps[i + 1].key;
    }
  }
  return steps.map((s) => ({ ...s, worst: s.key === worst }));
}

const format = (n: number) => n.toLocaleString("en-US");

export type Verdict = { label: string; tone: "ok" | "warn" | "bad" | "neutral" };

/** A channel against the site average, in visits. Needs 5+ visits to call it better or worse. */
export function verdict(s: { visits: number; clicked: number; signups: number }, avg: { clickRate: number; signupRate: number }): Verdict {
  const click = s.visits ? s.clicked / s.visits : 0;
  const signup = s.visits ? s.signups / s.visits : 0;
  if (s.visits >= 5) {
    if (avg.signupRate > 0 && signup >= avg.signupRate * 1.2) return { label: "Best", tone: "ok" };
    if (avg.clickRate > 0 && click >= avg.clickRate * 1.2) return { label: "Clicks well", tone: "ok" };
    if (s.clicked === 0) return { label: "Nobody clicked", tone: "bad" };
    if ((avg.signupRate > 0 && signup <= avg.signupRate * 0.8) || (avg.clickRate > 0 && click <= avg.clickRate * 0.8)) return { label: "Below average", tone: "warn" };
    return { label: "Average", tone: "neutral" };
  }
  if (s.signups > 0) return { label: "Brings sign-ups", tone: "ok" };
  if (s.clicked === 0) return { label: "Nobody clicked", tone: "warn" };
  return { label: "Too few to tell", tone: "neutral" };
}

export function averages(t: MarketingTotals) {
  return { clickRate: t.visits ? t.clickedVisits / t.visits : 0, signupRate: t.visits ? t.signups / t.visits : 0 };
}

/** Buttons on the site that nobody pressed in the period. */
export function neverPressed(buttons: MarketingReport["buttons"]): string[] {
  const pressed = new Set(buttons.map((b) => b.button));
  return Object.keys(BUTTON_LABELS)
    .filter((k) => !pressed.has(k))
    .map(buttonLabel);
}

export interface Note {
  tone: "good" | "bad" | "info";
  title: string;
  text: string;
}

/** Up to three things worth knowing, worst first. Says nothing until there is something to say. */
export function notes(r: MarketingReport): Note[] {
  const t = r.totals;
  const out: Note[] = [];
  if (t.visits === 0) return out;

  // Where most people are lost.
  const lostClick = t.clickedVisits - t.signups;
  if (t.clickedVisits >= 3 && lostClick / t.clickedVisits >= 0.5) {
    out.push({
      tone: "bad",
      title: `${lostClick} of ${t.clickedVisits} visits that clicked to the app never signed up`,
      text: "The site gets them to the app; the next step loses them. Check the web app's first screen and the Android install for someone new.",
    });
  } else if (t.visits >= 10 && t.clickedVisits / t.visits < 0.2) {
    out.push({
      tone: "bad",
      title: `Only ${pct(t.clickedVisits, t.visits)} of visits click to the app`,
      text: "People read but don't go on. Make the first button bigger and say what happens when they press it.",
    });
  }

  // Signed up but never met a real person: the app, not the site, is losing them.
  const noCall = t.signups - t.firstCalls;
  if (out.length < 2 && t.signups >= 3 && noCall / t.signups >= 0.5) {
    out.push({
      tone: "bad",
      title: `${noCall} of ${t.signups} people who signed up from the site never had a call with a real person`,
      text: "They arrive when nobody is online. Point posts and the site at the busy evening hours and Vibe Hour, so new people meet someone in their first minutes.",
    });
  }

  // Best channel: most sign-ups, then most clicks.
  const best = [...r.sources].filter((s) => s.visits > 0).sort((a, b) => b.signups - a.signups || b.clicked - a.clicked || b.visits - a.visits)[0];
  if (best && (best.signups > 0 || best.clicked > 0)) {
    const campaign = r.campaigns.find((c) => c.source === best.source && c.signups > 0);
    out.push({
      tone: "good",
      title: `${sourceLabel(best.source)} is your best channel${r.sources.length > 1 ? "" : " so far"}`,
      text: `${best.visits} ${best.visits === 1 ? "visit" : "visits"}: ${best.clicked} clicked to the app, ${best.signups} signed up${best.paid ? `, ${best.paid} paid` : ""}${campaign ? ` — your “${campaign.campaign}” link did it` : ""}.`,
    });
  }

  // Strongest landing page (at least 2 visits, most go on to the app).
  const page = [...r.pages].filter((p) => p.visits >= 2).sort((a, b) => b.clicked / b.visits - a.clicked / a.visits || b.visits - a.visits)[0];
  if (page && page.clicked / page.visits >= 0.5) {
    out.push({
      tone: "info",
      title: `${page.path} is your strongest page`,
      text: `${page.visits} visits, ${pct(page.clicked, page.visits)} went on to the app. More pages like it bring more people.`,
    });
  }

  // Channels that send people who never click.
  const dead = r.sources.filter((s) => s.visits >= 3 && s.clicked === 0);
  if (out.length < 3 && dead.length) {
    out.push({
      tone: "info",
      title: `${dead.map((d) => sourceLabel(d.source)).join(", ")} ${dead.length === 1 ? "sends" : "send"} visitors who never click`,
      text: "Check what those people land on: the page may not match what they were looking for.",
    });
  }
  return out.slice(0, 3);
}
