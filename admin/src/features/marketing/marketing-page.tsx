"use client";

import { AlertTriangle, ArrowRight, Copy, Download, Globe, Info, TrendingUp } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { TimeSeriesChart } from "@/components/charts/time-series";
import { Time } from "@/components/common/bits";
import { EmptyState, ErrorState, PageHeader } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/controls";
import { Input, NativeSelect } from "@/components/ui/input";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import type { MarketingReport } from "@/lib/api/types";
import { format } from "@/lib/format";
import { cn } from "@/lib/utils";

import { buttonLabel, countryName, DID_LABELS, mediumLabel, placeLabel, SOURCE_LABELS, sourceLabel } from "./labels";
import { DEFINITIONS } from "./definitions";
import { exportMarketing } from "./export";
import { averages, journey, neverPressed, notes, type Note, type Step, verdict } from "./read";
import { DaysSwitch, Meter, periodLabel, SeeAll, share, useDays, useMarketing } from "./shared";

const TOP = 5;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Admin → Marketing site: is the website bringing people who sign up and
 * talk? Visit → first-call steps, plain notes, day by day, which channels,
 * pages and buttons work, where visitors are, the latest visits. Lists show
 * the top few; "See all" opens the whole list a page at a time.
 */
export function MarketingPage() {
  const [days, setDays] = useDays();
  const q = useMarketing(days);
  const r = q.data;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const qs = `?days=${days}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Marketing site"
        description={
          r ? (
            <>
              Is {r.siteUrl.replace(/^https?:\/\//, "")} bringing people who sign up and talk? {cap(periodLabel(days))}, against the same time before · updated <Time iso={r.generatedAt} />
            </>
          ) : (
            "Is the website bringing people who sign up and talk?"
          )
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {r ? (
              <Badge tone={r.live.now ? "ok" : "neutral"} dot>
                {r.live.now} on the site now
              </Badge>
            ) : null}
            {r ? (
              <a
                href={`${r.siteUrl}/?notrack=1`}
                target="_blank"
                rel="noopener"
                className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-xs font-medium text-text-2 hover:text-text"
                title="Opens the site once with ?notrack=1 — visits from this browser stop counting"
              >
                Ignore my visits
              </a>
            ) : null}
            <ExportButton days={days} />
            <DaysSwitch value={days} onChange={setDays} />
          </div>
        }
      />

      <Journey r={r} loading={q.isLoading} />

      {r && r.totals.visits === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={Globe}
              title="No visits counted yet"
              description="Visits appear here a few seconds after someone opens the marketing site. Make sure the landing page is deployed with NEXT_PUBLIC_VIBE_API set."
            />
          </CardBody>
        </Card>
      ) : null}

      {r ? <Notes notes={notes(r)} /> : null}

      <Card>
        <CardHeader
          title="Day by day"
          description="The day a post or a campaign went out should jump. Hover a day for its numbers."
          actions={
            <Link href="/growth" className="text-xs font-medium text-primary hover:underline">
              What happens after sign-up →
            </Link>
          }
        />
        <CardBody>
          <TimeSeriesChart
            data={r?.daily}
            loading={q.isLoading}
            height={220}
            series={[
              { key: "visits", label: "Visits", color: 5 },
              { key: "clicked", label: "Clicked to the app", color: 1 },
              { key: "signups", label: "Signed up", color: 3 },
            ]}
          />
        </CardBody>
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Channels r={r} href={`/marketing/all/channels${qs}`} />
        <Campaigns r={r} href={`/marketing/all/campaigns${qs}`} />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Pages r={r} href={`/marketing/all/pages${qs}`} />
        <Buttons r={r} href={`/marketing/all/buttons${qs}`} />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Places r={r} href={`/marketing/all/countries${qs}`} />
        <Devices r={r} />
      </div>

      <LatestVisits r={r} href={`/marketing/visits${qs}`} days={days} />
    </div>
  );
}

/** Downloads everything on this page for the chosen period — counts, steps, every list and every visit — as JSON. */
function ExportButton({ days }: { days: number }) {
  const [progress, setProgress] = React.useState<string | null>(null);
  const run = async () => {
    setProgress("Preparing…");
    try {
      const x = await exportMarketing(days, (done, total) => setProgress(total ? `Visits ${format.number(done)} / ${format.number(total)}` : "Preparing…"));
      toast.success(`Exported ${periodLabel(days)}: ${format.number(x.visits.exported)} visits`, {
        description: x.visits.complete ? undefined : `Stopped at ${format.number(x.visits.exported)} of ${format.number(x.visits.total)} visits. Pick a shorter period for the rest.`,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't export");
    } finally {
      setProgress(null);
    }
  };
  return (
    <Button variant="secondary" size="sm" className="text-xs" onClick={() => void run()} disabled={progress !== null} title={`Download ${periodLabel(days)} as JSON: every count, list and visit`}>
      <Download className="size-3.5" />
      {progress ?? "Export JSON"}
    </Button>
  );
}

// ── The journey ──────────────────────────────────────────────────────────

function Journey({ r, loading }: { r?: MarketingReport; loading: boolean }) {
  const steps = r ? journey(r.totals, r.previous) : null;
  return (
    <Card>
      <CardHeader title="From visit to paying" description="The first three steps count visits; the rest count what those sign-ups did next. Hover a step for exactly what it counts. The red step is where most are lost." />
      <CardBody>
        {loading || !steps ? (
          <Skeleton className="h-28" />
        ) : (
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 lg:gap-0">
            {steps.map((s, i) => (
              <JourneyStep key={s.key} s={s} last={i === steps.length - 1} />
            ))}
          </ol>
        )}
      </CardBody>
      {r ? (
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line bg-surface-2/40 px-4 py-2.5 text-xs text-text-2">
          <span title={DEFINITIONS.engaged}>
            Engaged: <b className="font-semibold text-text tabular-nums">{format.number(r.totals.engagedVisits)}</b> ({share(r.totals.engagedVisits, r.totals.visits)} of visits)
          </span>
          <span title={DEFINITIONS.downloaded}>
            Android downloads: <b className="font-semibold text-text tabular-nums">{format.number(r.totals.downloadedVisits)}</b> from visits · {format.number(r.totals.downloads)} in all
          </span>
          <span>
            Pages read: <b className="font-semibold text-text tabular-nums">{format.number(r.totals.pageViews)}</b>
          </span>
          <span>
            Time on site: <b className="font-semibold text-text">{format.duration(r.totals.medianSeconds)}</b> median
          </span>
          <span>
            Button presses: <b className="font-semibold text-text tabular-nums">{format.number(r.totals.clicks)}</b>
          </span>
        </div>
      ) : null}
    </Card>
  );
}

function JourneyStep({ s, last }: { s: Step; last: boolean }) {
  return (
    <li className="flex min-w-0 items-stretch">
      <div title={s.hint} className={cn("min-w-0 flex-1 cursor-help rounded-xl border p-3", s.worst ? "border-bad/30 bg-bad-soft" : "border-line bg-surface-2/40")}>
        <p className="flex items-center gap-1 text-xs font-medium text-text-2">
          {s.label}
          <Info className="size-3 text-muted" aria-hidden />
        </p>
        <span className="sr-only">{s.hint}</span>
        <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums sm:text-[28px]">{format.number(s.value)}</p>
        <p className="text-xs text-text-2">{s.rate}</p>
        {s.delta.text ? <p className={cn("mt-1.5 text-[11.5px] font-medium", s.delta.tone === "ok" ? "text-ok" : s.delta.tone === "bad" ? "text-bad" : "text-muted")}>{s.delta.text}</p> : null}
      </div>
      {!last ? (
        <div className="hidden w-7 shrink-0 flex-col items-center justify-center gap-0.5 lg:flex" aria-hidden>
          <ArrowRight className="size-3.5 text-muted" />
          {s.lostAfter ? <span className="text-[10.5px] font-semibold text-muted tabular-nums">−{s.lostAfter}</span> : null}
        </div>
      ) : null}
    </li>
  );
}

// ── Notes ────────────────────────────────────────────────────────────────

const NOTE_LOOK: Record<Note["tone"], { icon: React.ElementType; className: string }> = {
  bad: { icon: AlertTriangle, className: "bg-bad-soft text-bad" },
  good: { icon: TrendingUp, className: "bg-ok-soft text-ok" },
  info: { icon: Info, className: "bg-info-soft text-info" },
};

function Notes({ notes }: { notes: Note[] }) {
  if (!notes.length) return null;
  return (
    <Card>
      <CardHeader title="What this tells you" description="Read from the numbers on this page." />
      <CardBody>
        <ul className="grid gap-3">
          {notes.map((n) => {
            const L = NOTE_LOOK[n.tone];
            return (
              <li key={n.title} className="flex items-start gap-3">
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", L.className)}>
                  <L.icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{n.title}</p>
                  <p className="text-[13px] text-text-2">{n.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}

// ── Channels and campaigns ───────────────────────────────────────────────

export function ChannelRows({ rows, r }: { rows: MarketingReport["sources"]; r: MarketingReport }) {
  const avg = averages(r.totals);
  return (
    <>
      {rows.map((s) => {
        const v = verdict(s, avg);
        return (
          <Tr key={`${s.source}|${s.medium}`}>
            <Td>
              <div className="font-medium">{sourceLabel(s.source)}</div>
              <div className="text-xs text-muted">{mediumLabel(s.medium)}</div>
            </Td>
            <Td className="text-right tabular-nums" title={`${format.number(s.visitors)} ${s.visitors === 1 ? "browser" : "browsers"}`}>
              {format.number(s.visits)}
            </Td>
            <Td className="min-w-36">
              <div className="flex items-center gap-2">
                <Meter value={s.visits ? s.clicked / s.visits : 0} className="flex-1" />
                <span className="w-9 text-right text-text-2 tabular-nums">{share(s.clicked, s.visits)}</span>
              </div>
            </Td>
            <Td className="text-right font-semibold tabular-nums">
              {format.number(s.signups)} <span className="text-xs font-normal text-muted">{share(s.signups, s.visits)}</span>
            </Td>
            <Td className="text-right tabular-nums">{format.number(s.paid)}</Td>
            <Td>
              <Badge tone={v.tone}>{v.label}</Badge>
            </Td>
          </Tr>
        );
      })}
    </>
  );
}

export function ChannelHead() {
  return (
    <thead>
      <Tr>
        <Th>Channel</Th>
        <Th className="text-right" title={DEFINITIONS.visits}>
          Visits
        </Th>
        <Th title={DEFINITIONS.clicked}>Clicked to the app</Th>
        <Th className="text-right" title={DEFINITIONS.signups}>
          Sign-ups
        </Th>
        <Th className="text-right" title={DEFINITIONS.paid}>
          Paid
        </Th>
        <Th>Verdict</Th>
      </Tr>
    </thead>
  );
}

/** Sign-ups first, then clicks, then visitors. */
export const byResult = (a: MarketingReport["sources"][number], b: MarketingReport["sources"][number]) => b.signups - a.signups || b.clicked - a.clicked || b.visits - a.visits;

function Channels({ r, href }: { r?: MarketingReport; href: string }) {
  const rows = r ? [...r.sources].sort(byResult) : [];
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Which channels work" description="Sorted by sign-ups. Every % is out of that channel's visits. The verdict compares it with the site average and needs 5+ visits to call it better or worse." />
      {!r ? (
        <CardBody>
          <Skeleton className="h-48" />
        </CardBody>
      ) : rows.length ? (
        <Table>
          <ChannelHead />
          <tbody>
            <ChannelRows rows={rows.slice(0, TOP)} r={r} />
          </tbody>
        </Table>
      ) : (
        <p className="p-4 text-sm text-muted">No visits in this period.</p>
      )}
      <SeeAll shown={Math.min(TOP, rows.length)} total={rows.length} noun="channels" href={href} />
    </Card>
  );
}

function Campaigns({ r, href }: { r?: MarketingReport; href: string }) {
  const [source, setSource] = React.useState("tiktok");
  const [name, setName] = React.useState("");
  const link = r ? `${r.siteUrl}/?utm_source=${encodeURIComponent(source)}&utm_campaign=${encodeURIComponent(name.trim().toLowerCase().replace(/\s+/g, "-") || "my-post")}` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — select the link and copy it");
    }
  };
  const list = r?.campaigns ?? [];
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader title="Your campaigns" description="Links you tagged yourself (?utm_campaign=…). One per post or ad, so you know which one worked." />
      <CardBody className="grid flex-1 content-start gap-2.5">
        {!r ? <Skeleton className="h-24" /> : null}
        {r && !list.length ? <p className="text-sm text-muted">No tagged links used yet. Make one below and put it in your next post.</p> : null}
        {list.slice(0, 3).map((c) => (
          <div key={`${c.campaign}|${c.source}|${c.medium}`} className="rounded-xl border border-line p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-semibold">{c.campaign}</span>
              <span className="shrink-0 text-xs text-muted">
                {sourceLabel(c.source)} · {mediumLabel(c.medium)}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-text-2">
              <span>
                <b className="text-[15px] font-semibold text-text tabular-nums">{format.number(c.visits)}</b> {c.visits === 1 ? "visit" : "visits"}
              </span>
              <span>
                <b className="text-[15px] font-semibold text-text tabular-nums">{format.number(c.signups)}</b> {c.signups === 1 ? "sign-up" : "sign-ups"}
              </span>
              <span>
                <b className="text-[15px] font-semibold text-text">{share(c.signups, c.visits)}</b> of visits signed up
              </span>
            </div>
          </div>
        ))}
        {r ? (
          <div className="rounded-xl border border-dashed border-line-strong p-3">
            <p className="text-sm font-semibold">Make a tracked link</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <NativeSelect value={source} onChange={(e) => setSource(e.target.value)} className="h-9 w-36" aria-label="Where you'll post it">
                {["tiktok", "instagram", "facebook", "whatsapp", "youtube", "x", "telegram", "snapchat"].map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </option>
                ))}
              </NativeSelect>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Post name, e.g. eid-video" className="h-9 min-w-0 flex-1" aria-label="Post name" maxLength={40} />
            </div>
            <p className="mt-2 rounded-lg bg-surface-2 px-2.5 py-2 font-mono text-[11.5px] break-all text-text-2">{link}</p>
            <Button size="sm" className="mt-2" onClick={() => void copy()}>
              <Copy />
              Copy link
            </Button>
          </div>
        ) : null}
      </CardBody>
      {list.length > 3 ? <SeeAll shown={3} total={list.length} noun="campaigns" href={href} /> : null}
    </Card>
  );
}

// ── Pages and buttons ────────────────────────────────────────────────────

export function PageRow({ p }: { p: MarketingReport["pages"][number] }) {
  const rate = p.visits ? p.clicked / p.visits : 0;
  const tone = rate >= 0.6 ? "bg-ok" : rate >= 0.3 ? "bg-warn" : "bg-bad";
  const text = rate >= 0.6 ? "text-ok" : rate >= 0.3 ? "text-warn" : "text-bad";
  return (
    <li>
      <div className="flex justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-mono text-[12.5px] text-primary" title={p.path}>
          {p.path}
        </span>
        <span className="shrink-0 text-text-2 tabular-nums">
          {format.number(p.visits)} {p.visits === 1 ? "visit" : "visits"} · <b className={cn("font-semibold", text)}>{share(p.clicked, p.visits)}</b> to app
          {p.signups ? ` · ${format.number(p.signups)} signed up` : ""}
        </span>
      </div>
      <Meter value={rate} className="mt-1.5" barClassName={tone} />
    </li>
  );
}

function Pages({ r, href }: { r?: MarketingReport; href: string }) {
  const rows = r?.pages ?? [];
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Pages people land on" description="The first page of each visit — mostly where Google or ChatGPT sent them. Green: most go on to the app." />
      <CardBody>
        {!r ? (
          <Skeleton className="h-40" />
        ) : rows.length ? (
          <ul className="grid gap-3">
            {rows.slice(0, TOP).map((p) => (
              <PageRow key={p.path} p={p} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No visits in this period.</p>
        )}
      </CardBody>
      <SeeAll shown={Math.min(TOP, rows.length)} total={rows.length} noun="pages" href={href} />
    </Card>
  );
}

export function ButtonRow({ b, max }: { b: MarketingReport["buttons"][number]; max: number }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{buttonLabel(b.button)}</p>
        <p className="text-xs text-muted">{b.target ? `opens ${b.target === "play" ? "the Android download" : b.target}` : " "}</p>
      </div>
      <p className="text-right text-[12.5px] text-text-2 tabular-nums">
        <b className="font-semibold text-text">{format.number(b.clicks)}</b> {b.clicks === 1 ? "click" : "clicks"} · <b className="font-semibold text-text">{format.number(b.signups)}</b>{" "}
        {b.signups === 1 ? "sign-up" : "sign-ups"}
      </p>
      <Meter value={max ? b.clicks / max : 0} className="col-span-2" />
    </li>
  );
}

function Buttons({ r, href }: { r?: MarketingReport; href: string }) {
  const rows = r?.buttons ?? [];
  const max = Math.max(1, ...rows.map((b) => b.clicks));
  const idle = r ? neverPressed(rows) : [];
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Buttons that get pressed" description='Every "Start", "Get the app" and Android button. A sign-up counts for the last button that person pressed.' />
      <CardBody className="space-y-3">
        {!r ? (
          <Skeleton className="h-40" />
        ) : rows.length ? (
          <ul className="grid gap-3">
            {rows.slice(0, TOP).map((b) => (
              <ButtonRow key={b.button} b={b} max={max} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nobody pressed a button in this period.</p>
        )}
        {idle.length && rows.length ? (
          <p className="rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
            Never pressed in {periodLabel(Number(r?.days))}: {idle.join(", ")}.
          </p>
        ) : null}
      </CardBody>
      <SeeAll shown={Math.min(TOP, rows.length)} total={rows.length} noun="buttons" href={href} />
    </Card>
  );
}

// ── Places and devices ───────────────────────────────────────────────────

export function CountryRow({ c, total, children }: { c: MarketingReport["countries"][number]; total: number; children?: React.ReactNode }) {
  return (
    <li>
      <div className="flex justify-between gap-3 text-sm">
        <span className="font-medium">{countryName(c.country)}</span>
        <span className="text-text-2 tabular-nums">
          {format.number(c.visitors)} · {share(c.visitors, total)}
        </span>
      </div>
      <Meter value={total ? c.visitors / total : 0} className="mt-1.5" barClassName="bg-info" />
      {c.regions.length ? <p className="mt-1 text-xs text-muted">{c.regions.map((g) => `${g.name} ${g.visitors}`).join(" · ")}</p> : null}
      {children}
    </li>
  );
}

function Places({ r, href }: { r?: MarketingReport; href: string }) {
  const rows = r?.countries ?? [];
  const total = r?.totals.visitors ?? 0;
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Where visitors are" description="From the visitor's network; the address itself is never stored." />
      <CardBody className="space-y-4">
        {!r ? (
          <Skeleton className="h-40" />
        ) : rows.length ? (
          <ul className="grid gap-3">
            {rows.slice(0, TOP).map((c) => (
              <CountryRow key={c.country} c={{ ...c, regions: c.regions.slice(0, 4) }} total={total} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No visits in this period.</p>
        )}
        {r?.cities.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted">Top cities</span>
            {r.cities.slice(0, 8).map((c) => (
              <span key={`${c.city}|${c.country}`} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs">
                {c.city} {c.visitors}
              </span>
            ))}
          </div>
        ) : null}
      </CardBody>
      <SeeAll shown={Math.min(TOP, rows.length)} total={rows.length} noun="countries" href={href} />
    </Card>
  );
}

const DEVICE_COLORS = ["bg-[var(--chart-1)]", "bg-[var(--chart-2)]", "bg-[var(--chart-3)]", "bg-[var(--chart-5)]", "bg-[var(--chart-4)]", "bg-muted"];
const LANGS: Record<string, string> = { ur: "Urdu", en: "English", ar: "Arabic", hi: "Hindi", pa: "Punjabi", ps: "Pashto", fa: "Persian", tr: "Turkish", bn: "Bengali" };

function Devices({ r }: { r?: MarketingReport }) {
  const groups = r
    ? [
        { label: "Device", items: r.devices.device.map((d) => ({ ...d, name: d.name === "phone" ? "Phone" : d.name === "computer" ? "Computer" : d.name === "tablet" ? "Tablet" : d.name })) },
        { label: "System", items: r.devices.os },
        { label: "Browser", items: r.devices.browser },
        { label: "Language", items: r.devices.lang.map((d) => ({ ...d, name: LANGS[d.name] ?? d.name })) },
      ]
    : [];
  return (
    <Card className="overflow-hidden">
      <CardHeader title="What they use" description="Design and test for the biggest part of each bar." />
      <CardBody className="grid gap-4">
        {!r ? <Skeleton className="h-40" /> : null}
        {groups.map((g) => {
          const total = g.items.reduce((n, x) => n + x.visitors, 0);
          const top = g.items.slice(0, 5);
          return (
            <div key={g.label}>
              <p className="text-[11px] font-medium tracking-wide text-muted uppercase">{g.label}</p>
              <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-surface-2">
                {top.map((x, i) => (
                  <div key={x.name} className={DEVICE_COLORS[i]} style={{ width: `${total ? (x.visitors / total) * 100 : 0}%` }} title={`${x.name}: ${share(x.visitors, total)}`} />
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-2">
                {top.map((x, i) => (
                  <span key={x.name} className="inline-flex items-center gap-1.5">
                    <span className={cn("size-2 rounded-full", DEVICE_COLORS[i])} />
                    {x.name} <span className="text-muted tabular-nums">{share(x.visitors, total)}</span>
                  </span>
                ))}
                {!top.length ? <span className="text-muted">—</span> : null}
              </div>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

// ── Latest visits ────────────────────────────────────────────────────────

function LatestVisits({ r, href, days }: { r?: MarketingReport; href: string; days: number }) {
  const rows = r?.live.recent ?? [];
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Latest visits" description="The 10 newest. Refreshes every minute." />
      {!r ? (
        <CardBody>
          <Skeleton className="h-40" />
        </CardBody>
      ) : rows.length ? (
        <Table>
          <tbody>
            {rows.map((v, i) => (
              <Tr key={`${v.at}|${i}`}>
                <Td className="whitespace-nowrap text-text-2">{format.ago(v.at)}</Td>
                <Td>
                  <div className="font-medium">{placeLabel(v)}</div>
                  <div className="text-xs text-muted">from {sourceLabel(v.source)}</div>
                </Td>
                <Td className="hidden font-mono text-xs text-text-2 sm:table-cell">{v.path}</Td>
                <Td className="text-right">
                  <Badge tone={DID_LABELS[v.did].tone}>{DID_LABELS[v.did].label}</Badge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p className="p-4 text-sm text-muted">No visits yet.</p>
      )}
      {rows.length ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs text-muted">
          <span>
            The latest {rows.length} · {format.number(r?.totals.visits)} visits in {periodLabel(days)}
          </span>
          <Link href={href} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-surface px-3 font-medium text-text shadow-card hover:bg-surface-2">
            See all visits
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
