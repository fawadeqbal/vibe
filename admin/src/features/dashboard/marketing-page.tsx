"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, Eye, Globe, MousePointerClick, UserPlus, Video } from "lucide-react";
import * as React from "react";

import { Time } from "@/components/common/bits";
import { EmptyState, ErrorState, PageHeader } from "@/components/common/page";
import { StatCard } from "@/components/common/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/controls";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import type { MarketingNamed, MarketingReport, MarketingTotals } from "@/lib/api/types";
import { format } from "@/lib/format";

export const marketingKeys = {
  report: (days: number) => ["dashboard", "marketing", days] as const,
};

const share = (n: number, of: number) => (of > 0 ? format.percent(n / of) : "—");

const regionNames = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
const countryName = (code: string) => {
  if (!/^[A-Z]{2}$/.test(code)) return code === "Unknown" ? "Unknown" : code;
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
};

const SOURCE_LABELS: Record<string, string> = {
  google: "Google",
  bing: "Bing",
  duckduckgo: "DuckDuckGo",
  yahoo: "Yahoo",
  yandex: "Yandex",
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
  copilot: "Copilot",
  claude: "Claude",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  whatsapp: "WhatsApp",
  x: "X (Twitter)",
  telegram: "Telegram",
  snapchat: "Snapchat",
  reddit: "Reddit",
  linkedin: "LinkedIn",
  invite: "Invite links",
  direct: "Direct / typed",
};
const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s;
const MEDIUM_TONE: Record<string, "primary" | "info" | "ok" | "warn" | "neutral" | "trust"> = {
  search: "info",
  social: "primary",
  paid: "warn",
  invite: "ok",
  ai: "trust",
};

const BUTTON_LABELS: Record<string, string> = {
  hero_start: "Home hero · Start",
  hero_android: "Home hero · Android",
  header_app: "Header · Get the app",
  discover_open: "Discover · Open Discover",
  vip_trial: "VIP · Start free trial",
  final_cta: "Home bottom · Get the app",
  invite_open: "Invite friends",
  page_cta: "Search page · box button",
  page_android: "Search page · box Android",
  page_hero: "Search page · top button",
  page_hero_android: "Search page · top Android",
  invite_web: "Invite page · web app",
  footer_web: "Footer · Open web app",
  footer_android: "Footer · Android app",
  link: "Other links",
};

/** "▲ 12%" against the previous window of the same length. */
function Delta({ now, before }: { now: number; before: number }) {
  if (before <= 0) return now > 0 ? <span className="text-ok">new</span> : null;
  const d = (now - before) / before;
  if (Math.abs(d) < 0.005) return <span className="text-muted">same as before</span>;
  return <span className={d > 0 ? "text-ok" : "text-bad"}>{`${d > 0 ? "▲" : "▼"} ${format.percent(Math.abs(d))} vs previous`}</span>;
}

function Bars({ items, total }: { items: MarketingNamed[]; total: number }) {
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.name}>
          <div className="flex justify-between text-sm">
            <span className="truncate">{i.name}</span>
            <span className="tabular text-text-2">{share(i.visitors, total)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-primary" style={{ width: `${total > 0 ? Math.max(2, (i.visitors / total) * 100) : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const DID: Record<MarketingReport["live"]["recent"][number]["did"], { label: string; tone: "ok" | "primary" | "neutral" | "info" }> = {
  signed_up: { label: "Signed up", tone: "ok" },
  clicked: { label: "Clicked", tone: "primary" },
  reading: { label: "Reading", tone: "info" },
  left: { label: "Left", tone: "neutral" },
};

/**
 * Marketing-site traffic (landing/): visitors, clicks into the app and the
 * sign-ups they turned into, by source, country/region, page, button,
 * campaign and device. Counted by our own beacons — no third-party trackers.
 */
export function MarketingPage() {
  const [days, setDays] = React.useState(7);
  const q = useQuery({
    queryKey: marketingKeys.report(days),
    queryFn: ({ signal }) => api.get<MarketingReport>("admin/dashboard/marketing", { days }, signal),
    refetchInterval: 60_000,
  });
  const r = q.data;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const t: MarketingTotals | undefined = r?.totals;
  const p = r?.previous;
  const maxDay = Math.max(1, ...(r?.daily ?? []).map((d) => d.visitors));
  const deviceTotal = (list: MarketingNamed[]) => list.reduce((a, b) => a + b.visitors, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Marketing site"
        description={
          r ? (
            <>
              Visitors to {r.siteUrl.replace(/^https?:\/\//, "")} · last {days === 1 ? "24 hours" : `${days} days`} · updated <Time iso={r.generatedAt} />
            </>
          ) : (
            "Who visits the landing page, where they come from, and how many go on to the app."
          )
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
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
            <Segmented
              value={days}
              onChange={setDays}
              options={[
                { value: 1, label: "Today" },
                { value: 7, label: "7 days" },
                { value: 30, label: "30 days" },
                { value: 90, label: "90 days" },
              ]}
            />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard label="Visitors" icon={Eye} tone="trust" loading={q.isLoading} value={format.number(t?.visitors)} hint={t && p && <><Delta now={t.visitors} before={p.visitors} /> · {format.number(t.pageViews)} page views</>} />
        <StatCard label="Clicked to the app" icon={MousePointerClick} tone="primary" loading={q.isLoading} value={format.number(t?.clickedVisits)} hint={t && p && <><Delta now={t.clickedVisits} before={p.clickedVisits} /> · {share(t.clickedVisits, t.visits)} of visits</>} />
        <StatCard label="Signed up" icon={UserPlus} tone="ok" loading={q.isLoading} value={format.number(t?.signups)} hint={t && p && <><Delta now={t.signups} before={p.signups} /> · {share(t.signups, t.clickedVisits)} of clicks</>} />
        <StatCard label="Had a first call" icon={Video} tone="info" loading={q.isLoading} value={format.number(t?.firstCalls)} hint={t && `${share(t.firstCalls, t.signups)} of sign-ups`} />
        <StatCard label="Time on site" icon={Clock} tone="neutral" loading={q.isLoading} value={t ? format.duration(t.medianSeconds) : "—"} hint="median per visit" />
      </div>

      <Card>
        <CardHeader title="From visit to first call" description="Each step as a share of visits in the period." />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Visited the site", n: t?.visits ?? 0, color: "bg-muted" },
              { label: "Clicked to the app", n: t?.clickedVisits ?? 0, color: "bg-primary" },
              { label: "Signed up", n: t?.signups ?? 0, color: "bg-info" },
              { label: "First call", n: t?.firstCalls ?? 0, color: "bg-ok" },
            ].map((s) => (
              <div key={s.label}>
                <div className="flex justify-between text-sm">
                  <span className="text-text-2">{s.label}</span>
                  <span className="tabular">{format.number(s.n)}</span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <div className={`h-full rounded-full ${s.color}`} style={{ width: `${t && t.visits > 0 ? Math.max(1, (s.n / t.visits) * 100) : 0}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted">{t ? share(s.n, t.visits) : "—"}</p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

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

      <Card>
        <CardHeader title="Visitors and clicks by day" description="Grey: visitors. Purple: visits that clicked to the app." />
        <CardBody>
          <div className="flex h-44 items-end gap-1.5 overflow-x-auto" role="img" aria-label="Daily visitors and clicks to the app">
            {(r?.daily ?? []).map((d) => (
              <div key={d.day} className="flex min-w-[22px] flex-1 flex-col items-center gap-1" title={`${d.day}: ${d.visitors} visitors, ${d.clicked} clicked, ${d.signups} signed up`}>
                <div className="flex h-36 w-full items-end justify-center gap-0.5">
                  <div className="w-1/2 max-w-4 rounded-t bg-muted/50" style={{ height: `${(d.visitors / maxDay) * 100}%` }} />
                  <div className="w-1/2 max-w-4 rounded-t bg-primary" style={{ height: `${(d.clicked / maxDay) * 100}%` }} />
                </div>
                <span className="text-[10.5px] text-muted tabular">{d.day.slice(5)}</span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Where visitors come from" description="The link's UTM tags first, else the site they came from. Invite links count as Invites." />
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <Tr>
                  <Th>Source</Th>
                  <Th className="text-right">Visitors</Th>
                  <Th className="text-right">To app</Th>
                  <Th className="text-right">Rate</Th>
                  <Th className="text-right">Sign-ups</Th>
                </Tr>
              </thead>
              <tbody>
                {(r?.sources ?? []).map((s) => (
                  <Tr key={`${s.source}|${s.medium}`}>
                    <Td>
                      <span className="mr-2">{sourceLabel(s.source)}</span>
                      <Badge tone={MEDIUM_TONE[s.medium] ?? "neutral"}>{s.medium}</Badge>
                    </Td>
                    <Td className="text-right tabular">{format.number(s.visitors)}</Td>
                    <Td className="text-right tabular">{format.number(s.clicked)}</Td>
                    <Td className="text-right tabular text-text-2">{share(s.clicked, s.visitors)}</Td>
                    <Td className="text-right tabular">{format.number(s.signups)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Countries and regions" description="From the visitor's network via Cloudflare; the address itself is never stored." />
          <CardBody>
            <ul className="space-y-3">
              {(r?.countries ?? []).map((c) => (
                <li key={c.country}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="w-7 font-mono text-xs text-muted">{c.country === "Unknown" ? "—" : c.country}</span>
                    <span className="flex-1 truncate">{countryName(c.country)}</span>
                    <span className="tabular">{format.number(c.visitors)}</span>
                    <span className="w-12 text-right text-xs text-muted tabular">{share(c.visitors, t?.visitors ?? 0)}</span>
                  </div>
                  <div className="mt-1 ml-9 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-info" style={{ width: `${r && r.countries[0] ? (c.visitors / r.countries[0].visitors) * 100 : 0}%` }} />
                  </div>
                  {c.regions.length ? <p className="mt-1 ml-9 text-xs text-text-2">{c.regions.map((g) => `${g.name} ${format.number(g.visitors)}`).join(" · ")}</p> : null}
                </li>
              ))}
            </ul>
            {r?.cities.length ? (
              <p className="mt-4 border-t border-line pt-3 text-xs text-text-2">
                <span className="font-medium text-text">Top cities: </span>
                {r.cities.map((c) => `${c.city}${c.country ? ` (${c.country})` : ""} ${format.number(c.visitors)}`).join(" · ")}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Buttons into the app" description="Every app and store link on the site is counted by the same function. Sign-ups go to the last button pressed." />
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <Tr>
                  <Th>Button</Th>
                  <Th>Opens</Th>
                  <Th className="text-right">Clicks</Th>
                  <Th className="text-right">Sign-ups</Th>
                </Tr>
              </thead>
              <tbody>
                {(r?.buttons ?? []).map((b) => (
                  <Tr key={b.button}>
                    <Td>
                      <span className="block">{BUTTON_LABELS[b.button] ?? b.button}</span>
                      <span className="block font-mono text-[11px] text-muted">{b.button}</span>
                    </Td>
                    <Td className="text-text-2">{b.target === "store" ? "App store" : (b.target ?? "—")}</Td>
                    <Td className="text-right tabular">{format.number(b.clicks)}</Td>
                    <Td className="text-right tabular">{format.number(b.signups)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Landing pages" description="The first page of each visit — mostly where search sent them." />
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <Tr>
                  <Th>Page</Th>
                  <Th className="text-right">Visits</Th>
                  <Th className="text-right">To app</Th>
                  <Th className="text-right">Rate</Th>
                </Tr>
              </thead>
              <tbody>
                {(r?.pages ?? []).map((pg) => (
                  <Tr key={pg.path}>
                    <Td>
                      <a href={`${r?.siteUrl ?? ""}${pg.path}`} target="_blank" rel="noopener" className="font-mono text-xs text-primary hover:underline">
                        {pg.path}
                      </a>
                    </Td>
                    <Td className="text-right tabular">{format.number(pg.visits)}</Td>
                    <Td className="text-right tabular">{format.number(pg.clicked)}</Td>
                    <Td className="text-right tabular text-text-2">{share(pg.clicked, pg.visits)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Campaigns" description="Links you tag yourself, e.g. ?utm_source=tiktok&utm_campaign=launch" />
          {r && !r.campaigns.length ? (
            <CardBody>
              <p className="text-sm text-text-2">No tagged links yet. Add utm_source and utm_campaign to links you post (bio links, ads, partners) to see them here.</p>
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <Tr>
                    <Th>Campaign</Th>
                    <Th>Source / medium</Th>
                    <Th className="text-right">Visitors</Th>
                    <Th className="text-right">Sign-ups</Th>
                  </Tr>
                </thead>
                <tbody>
                  {(r?.campaigns ?? []).map((c) => (
                    <Tr key={`${c.campaign}|${c.source}|${c.medium}`}>
                      <Td>{c.campaign}</Td>
                      <Td className="text-text-2">
                        {sourceLabel(c.source)} / {c.medium}
                      </Td>
                      <Td className="text-right tabular">{format.number(c.visitors)}</Td>
                      <Td className="text-right tabular">{format.number(c.signups)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Devices" description="Share of visitors." />
          <CardBody>
            {r ? (
              <div className="grid gap-5 sm:grid-cols-2">
                {(
                  [
                    ["Device", r.devices.device],
                    ["System", r.devices.os],
                    ["Browser", r.devices.browser],
                    ["Language", r.devices.lang],
                  ] as const
                ).map(([title, list]) => (
                  <div key={title}>
                    <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">{title}</p>
                    <Bars items={list.slice(0, 5)} total={deviceTotal(list)} />
                  </div>
                ))}
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <span className="size-2 rounded-full bg-ok" aria-hidden /> On the site in the last 5 minutes · {format.number(r?.live.now)}
            </span>
          }
          description="The latest visits. Refreshes every minute."
        />
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <Tr>
                <Th>Last seen</Th>
                <Th>Where</Th>
                <Th>From</Th>
                <Th>Page</Th>
                <Th>Did</Th>
              </Tr>
            </thead>
            <tbody>
              {(r?.live.recent ?? []).map((v, i) => (
                <Tr key={`${v.at}-${i}`}>
                  <Td className="whitespace-nowrap">
                    <Time iso={v.at} />
                  </Td>
                  <Td className="whitespace-nowrap">{[v.city, v.region, v.country].filter(Boolean).join(", ") || "—"}</Td>
                  <Td className="whitespace-nowrap">{sourceLabel(v.source)}</Td>
                  <Td className="font-mono text-xs">{v.path}</Td>
                  <Td>
                    <Badge tone={DID[v.did].tone}>{v.did === "clicked" && v.button ? `Clicked ${BUTTON_LABELS[v.button] ?? v.button}` : DID[v.did].label}</Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
