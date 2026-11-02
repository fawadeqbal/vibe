/**
 * Plain-language notes for the Dashboard: what changed, what's wrong, what
 * to do. Pure (numbers in, sentences out) so the rules are easy to test.
 */
export interface Note {
  tone: 'good' | 'bad' | 'info';
  text: string;
}

export interface Pair {
  cur: number;
  prev: number;
}

export interface NotesInput {
  /** Window length in days (1 = today). */
  days: number;
  goodCalls: Pair;
  active: Pair;
  signups: Pair;
  revenueUsd: Pair;
  matching: {
    searches: number;
    gaveUpRate: number;
    /** The hour (0–23, business time) with the longest waits, at least a few searches. */
    worstHour: { hour: number; avgWaitSec: number; searches: number } | null;
    busiestHour: { hour: number; searches: number } | null;
    calls: number;
    quickSkipRate: number;
    rematchSoon: number;
  };
  /** Came back next day, per source (only sources with enough people). */
  sources: { source: string; d1Rate: number; eligible: number }[];
}

/** 22 → "10pm", 0 → "12am". */
export function hourLabel(h: number): string {
  const x = ((h % 24) + 24) % 24;
  const n = x % 12 === 0 ? 12 : x % 12;
  return `${n}${x < 12 ? 'am' : 'pm'}`;
}

const pct = (r: number) => `${Math.round(r * 100)}%`;
const SOURCE_NAMES: Record<string, string> = { invite: 'invites', partner: 'creator partners', direct: 'direct visits', tiktok: 'TikTok', google: 'Google', instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp', youtube: 'YouTube', x: 'X' };
export const sourceName = (s: string) => SOURCE_NAMES[s] ?? s;

/** Change between two windows, or null when there's too little to compare. */
export function change(p: Pair, min = 5): number | null {
  if (p.prev < min && p.cur < min) return null;
  if (p.prev === 0) return null;
  return (p.cur - p.prev) / p.prev;
}

export function buildNotes(i: NotesInput, max = 4): Note[] {
  const out: Note[] = [];
  const period = i.days === 1 ? 'yesterday' : 'the week before';
  const m = i.matching;

  if (m.searches >= 10 && m.gaveUpRate >= 0.3) {
    out.push({ tone: 'bad', text: `${pct(m.gaveUpRate)} of searches ended with the person giving up before a match. People are leaving because nobody is there.` });
  }
  if (m.worstHour && m.worstHour.avgWaitSec >= 30) {
    const h = m.worstHour;
    out.push({
      tone: 'bad',
      text: `Waits are longest around ${hourLabel(h.hour)} (${Math.round(h.avgWaitSec)} s on average, ${h.searches} searches). Run Vibe Hour or post on TikTok just before then.`,
    });
  }

  const kpis: [string, Pair, (n: number) => string][] = [
    ['Good calls', i.goodCalls, (n) => `${n}`],
    ['New sign-ups', i.signups, (n) => `${n}`],
    ['Active people', i.active, (n) => `${n}`],
    ['Revenue', i.revenueUsd, (n) => `$${n.toFixed(2)}`],
  ];
  for (const [label, p] of kpis) {
    const c = change(p);
    if (c === null || Math.abs(c) < 0.2) continue;
    out.push({ tone: c > 0 ? 'good' : 'bad', text: `${label} ${c > 0 ? 'up' : 'down'} ${pct(Math.abs(c))} compared with ${period}.` });
  }

  if (m.calls >= 20 && m.quickSkipRate >= 0.5) {
    out.push({ tone: 'bad', text: `${pct(m.quickSkipRate)} of calls end in under 10 seconds — first impressions aren't landing (camera, light, or who gets matched).` });
  }

  const ranked = i.sources.filter((s) => s.eligible >= 5).sort((a, b) => b.d1Rate - a.d1Rate);
  if (ranked.length >= 2 && ranked[0].d1Rate - ranked[ranked.length - 1].d1Rate >= 0.1) {
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    out.push({ tone: 'info', text: `People from ${sourceName(best.source)} stay best: ${pct(best.d1Rate)} came back the next day, against ${pct(worst.d1Rate)} from ${sourceName(worst.source)}.` });
  }

  if (m.rematchSoon >= 5) {
    out.push({ tone: 'info', text: `${m.rematchSoon} times only two people were searching at once — the room is too empty at those hours.` });
  }
  if (m.busiestHour && m.busiestHour.searches >= 5) {
    out.push({ tone: 'info', text: `Most people search around ${hourLabel(m.busiestHour.hour)}. That's the best time to post on TikTok and to run Vibe Hour.` });
  }
  return out.slice(0, max);
}
