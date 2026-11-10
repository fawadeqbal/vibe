import { api, saveFile } from "@/lib/api/client";
import type {
  MarketingReport,
  MarketingVisit,
  MarketingVisitsPage,
} from "@/lib/api/types";

import { DEFINITIONS } from "./definitions";
import {
  buttonLabel,
  countryName,
  DID_LABELS,
  mediumLabel,
  sourceLabel,
} from "./labels";
import { journey, notes } from "./read";

const periodLabel = (days: number) =>
  days === 1 ? "the last 24 hours" : `the last ${days} days`;

/** Visits are fetched this many at a time (the most the API gives per page). */
const VISITS_PAGE = 100;
/** Stops after this many visits so a huge period can't hang the tab; the file says when it stopped. */
export const VISITS_CAP = 50_000;

export interface MarketingExport {
  exportedAt: string;
  site: string;
  period: { days: number; label: string; from: string; to: string };
  definitions: typeof DEFINITIONS;
  counts: {
    now: MarketingReport["totals"];
    before: MarketingReport["previous"];
    onTheSiteNow: number;
  };
  journey: {
    step: string;
    label: string;
    value: number;
    rate: string;
    lostAfter: number | null;
    change: string | null;
    biggestDrop: boolean;
  }[];
  notes: { tone: string; title: string; text: string }[];
  daily: MarketingReport["daily"];
  channels: (MarketingReport["sources"][number] & {
    sourceLabel: string;
    mediumLabel: string;
  })[];
  campaigns: (MarketingReport["campaigns"][number] & {
    sourceLabel: string;
    mediumLabel: string;
  })[];
  pages: MarketingReport["pages"];
  buttons: (MarketingReport["buttons"][number] & { label: string })[];
  countries: (MarketingReport["countries"][number] & { name: string })[];
  cities: (MarketingReport["cities"][number] & {
    countryName: string | null;
  })[];
  devices: MarketingReport["devices"];
  latest: MarketingReport["live"]["recent"];
  visits: {
    total: number;
    exported: number;
    complete: boolean;
    counts: MarketingVisitsPage["counts"] | null;
    items: (MarketingVisit & {
      sourceLabel: string;
      outcome: string;
      countryName: string | null;
    })[];
  };
}

/** Everything on the Marketing site page for one period, as one JSON document (pure: tested). */
export function buildExport(
  r: MarketingReport,
  visits: {
    items: MarketingVisit[];
    total: number;
    counts: MarketingVisitsPage["counts"] | null;
  },
  now = new Date(),
): MarketingExport {
  const to = new Date(r.generatedAt || now.toISOString());
  const from = new Date(to.getTime() - r.days * 86_400_000);
  return {
    exportedAt: now.toISOString(),
    site: r.siteUrl,
    period: {
      days: r.days,
      label: periodLabel(r.days),
      from: from.toISOString(),
      to: to.toISOString(),
    },
    definitions: DEFINITIONS,
    counts: { now: r.totals, before: r.previous, onTheSiteNow: r.live.now },
    journey: journey(r.totals, r.previous).map((s) => ({
      step: s.key,
      label: s.label,
      value: s.value,
      rate: s.rate,
      lostAfter: s.lostAfter,
      change: s.delta.text || null,
      biggestDrop: s.worst,
    })),
    notes: notes(r).map((n) => ({
      tone: n.tone,
      title: n.title,
      text: n.text,
    })),
    daily: r.daily,
    channels: r.sources.map((s) => ({
      ...s,
      sourceLabel: sourceLabel(s.source),
      mediumLabel: mediumLabel(s.medium),
    })),
    campaigns: r.campaigns.map((c) => ({
      ...c,
      sourceLabel: sourceLabel(c.source),
      mediumLabel: mediumLabel(c.medium),
    })),
    pages: r.pages,
    buttons: r.buttons.map((b) => ({ ...b, label: buttonLabel(b.button) })),
    countries: r.countries.map((c) => ({ ...c, name: countryName(c.country) })),
    cities: r.cities.map((c) => ({
      ...c,
      countryName: c.country ? countryName(c.country) : null,
    })),
    devices: r.devices,
    latest: r.live.recent,
    visits: {
      total: visits.total,
      exported: visits.items.length,
      complete: visits.items.length >= visits.total,
      counts: visits.counts,
      items: visits.items.map((v) => ({
        ...v,
        sourceLabel: sourceLabel(v.source),
        outcome: DID_LABELS[v.did]?.label ?? v.did,
        countryName: v.country ? countryName(v.country) : null,
      })),
    },
  };
}

/** "vibe-marketing-30-days-2026-11-10.json" */
export const exportName = (days: number, now = new Date()) =>
  `vibe-marketing-${days === 1 ? "today" : `${days}-days`}-${now.toISOString().slice(0, 10)}.json`;

/**
 * Fetches the period's report (fresh) and every visit in it, a page at a
 * time, then downloads it all as JSON. `onProgress` gets visits fetched so far.
 */
export async function exportMarketing(
  days: number,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<MarketingExport> {
  const report = await api.get<MarketingReport>(
    "admin/dashboard/marketing",
    { days },
    signal,
  );
  const items: MarketingVisit[] = [];
  let total = 0;
  let counts: MarketingVisitsPage["counts"] | null = null;
  for (let page = 1; ; page++) {
    const p = await api.get<MarketingVisitsPage>(
      "admin/dashboard/marketing/visits",
      { days, page, pageSize: VISITS_PAGE },
      signal,
    );
    if (page === 1) {
      total = p.total;
      counts = p.counts;
    }
    items.push(...p.items);
    onProgress?.(items.length, total);
    if (!p.items.length || items.length >= total || items.length >= VISITS_CAP)
      break;
  }
  const data = buildExport(report, { items, total, counts });
  saveFile(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    exportName(days),
  );
  return data;
}
