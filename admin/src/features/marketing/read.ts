import type { MarketingReport, MarketingTotals } from "@/lib/api/types";

import { BUTTON_LABELS, buttonLabel, sourceLabel } from "./labels";

/**
 * Turns the marketing report into plain answers: the visit → first-call
 * steps with where people are lost, a verdict per channel, and up to three
 * notes. Pure, so it is unit-tested.
 */

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "—");

export interface Step {
  key: "visitors" | "clicked" | "downloads" | "signups" | "firstCalls";
  label: string;
  value: number;
  /** "78% of visits" */
  rate: string;
  /** vs the period before: "new", "▲ 20%", "▼ 5%", "same", or "" when both are 0. */
  delta: { text: string; tone: "ok" | "bad" | "muted" };
  /** People lost before the next step ("−4"); null after the last one or a side step. */
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

/** Visitors → clicked → (Android download) → signed up → first call. The download is a side step: web sign-ups skip it. */
export function journey(t: MarketingTotals, p: MarketingTotals): Step[] {
  const lost = { visitors: Math.max(0, t.visits - t.clickedVisits), clicked: Math.max(0, t.clickedVisits - t.signups), signups: Math.max(0, t.signups - t.firstCalls) };
  const worstKey = (Object.entries(lost) as [keyof typeof lost, number][]).sort((a, b) => b[1] - a[1])[0];
  const steps: Omit<Step, "worst">[] = [
    { key: "visitors", label: "Visitors", value: t.visitors, rate: `${t.pageViews} page views`, delta: delta(t.visitors, p.visitors), lostAfter: lost.visitors },
    { key: "clicked", label: "Clicked to the app", value: t.clickedVisits, rate: `${pct(t.clickedVisits, t.visits)} of visits`, delta: delta(t.clickedVisits, p.clickedVisits), lostAfter: null },
    { key: "downloads", label: "Downloaded Android", value: t.downloads, rate: `${pct(t.downloads, t.clickedVisits)} of clicks`, delta: delta(t.downloads, p.downloads), lostAfter: lost.clicked },
    { key: "signups", label: "Signed up", value: t.signups, rate: `${pct(t.signups, t.clickedVisits)} of clicks`, delta: delta(t.signups, p.signups), lostAfter: lost.signups },
    { key: "firstCalls", label: "Had a first call", value: t.firstCalls, rate: `${pct(t.firstCalls, t.signups)} of sign-ups`, delta: delta(t.firstCalls, p.firstCalls), lostAfter: null },
  ];
  // The loss shown after "Downloaded" is the click → sign-up loss; highlight the step people didn't reach.
  const worstStep = worstKey && worstKey[1] > 0 ? ({ visitors: "clicked", clicked: "signups", signups: "firstCalls" } as const)[worstKey[0]] : null;
  return steps.map((s) => ({ ...s, worst: s.key === worstStep }));
}

export type Verdict = { label: string; tone: "ok" | "warn" | "bad" | "neutral" };

/** A channel against the site average. Needs 5+ visitors to call it better or worse. */
export function verdict(s: { visitors: number; clicked: number; signups: number }, avg: { clickRate: number; signupRate: number }): Verdict {
  const click = s.visitors ? s.clicked / s.visitors : 0;
  const signup = s.visitors ? s.signups / s.visitors : 0;
  if (s.visitors >= 5) {
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
  return { clickRate: t.visits ? t.clickedVisits / t.visits : 0, signupRate: t.visitors ? t.signups / t.visitors : 0 };
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
      title: `${lostClick} of ${t.clickedVisits} people who clicked never signed up`,
      text: "The site gets them to the app; the next step loses them. Check the web app's first screen and the Android install for someone new.",
    });
  } else if (t.visits >= 10 && t.clickedVisits / t.visits < 0.2) {
    out.push({
      tone: "bad",
      title: `Only ${pct(t.clickedVisits, t.visits)} of visits click to the app`,
      text: "People read but don't go on. Make the first button bigger and say what happens when they press it.",
    });
  }

  // Best channel: most sign-ups, then most clicks.
  const best = [...r.sources].filter((s) => s.visitors > 0).sort((a, b) => b.signups - a.signups || b.clicked - a.clicked || b.visitors - a.visitors)[0];
  if (best && (best.signups > 0 || best.clicked > 0)) {
    const campaign = r.campaigns.find((c) => c.source === best.source && c.signups > 0);
    out.push({
      tone: "good",
      title: `${sourceLabel(best.source)} is your best channel${r.sources.length > 1 ? "" : " so far"}`,
      text: `${best.visitors} ${best.visitors === 1 ? "visitor" : "visitors"}, ${best.clicked} clicked, ${best.signups} signed up${campaign ? ` — your “${campaign.campaign}” link did it` : ""}.`,
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
  const dead = r.sources.filter((s) => s.visitors >= 3 && s.clicked === 0);
  if (out.length < 3 && dead.length) {
    out.push({
      tone: "info",
      title: `${dead.map((d) => sourceLabel(d.source)).join(", ")} ${dead.length === 1 ? "sends" : "send"} visitors who never click`,
      text: "Check what those people land on: the page may not match what they were looking for.",
    });
  }
  return out.slice(0, 3);
}
