"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, Globe, Smartphone, UserPlus } from "lucide-react";
import * as React from "react";

import { TimeSeriesChart } from "@/components/charts/time-series";
import { Time } from "@/components/common/bits";
import { ErrorState, PageHeader } from "@/components/common/page";
import { StatCard } from "@/components/common/stat-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/controls";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import { format } from "@/lib/format";

type ByClient = { android: number; ios: number; web: number };
export interface PlatformsReport {
  days: number;
  generatedAt: string;
  signups: ByClient & { unknown: number };
  signupsAllTime: ByClient & { unknown: number };
  activeToday: ByClient;
  activeInWindow: ByClient;
  daily: { day: string; signups: ByClient; active: ByClient }[];
  downloads: { inWindow: number; allTime: number; bySource: { source: string; downloads: number }[]; github: number | null };
}

export const platformKeys = { report: (days: number) => ["dashboard", "platforms", days] as const };

const app = (c: ByClient) => c.android + c.ios;
const share = (n: number, of: number) => (of > 0 ? format.percent(n / of) : "—");

/** App vs web: where accounts are made, who uses which, and Android downloads. */
export function PlatformsPage() {
  const [days, setDays] = React.useState(7);
  const q = useQuery({
    queryKey: platformKeys.report(days),
    queryFn: ({ signal }) => api.get<PlatformsReport>("admin/dashboard/platforms", { days }, signal),
  });
  const r = q.data;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const s = r?.signups;
  const signupsTotal = s ? app(s) + s.web + s.unknown : 0;
  const a = r?.activeInWindow;
  const t = r?.activeToday;
  const daily = r?.daily.map((d) => ({ day: d.day, appSignups: app(d.signups), webSignups: d.signups.web, appActive: app(d.active), webActive: d.active.web }));
  const iosNote = (c: ByClient | undefined) => (c && c.ios ? ` (${format.number(c.ios)} iPhone)` : "");

  return (
    <div className="space-y-5">
      <PageHeader
        title="App vs web"
        description={
          r ? (
            <>
              Last {days === 1 ? "day" : `${days} days`} · updated <Time iso={r.generatedAt} />
            </>
          ) : (
            "How many people sign up and use Vibe in the mobile app and on the web."
          )
        }
        actions={
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
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Sign-ups in the app" icon={Smartphone} tone="primary" loading={q.isLoading} value={format.number(s && app(s))} hint={s && `${share(app(s), signupsTotal)} of sign-ups${iosNote(s)}`} />
        <StatCard label="Sign-ups on the web" icon={Globe} tone="trust" loading={q.isLoading} value={format.number(s?.web)} hint={s && `${share(s.web, signupsTotal)} of sign-ups`} />
        <StatCard label="Used the app" icon={UserPlus} tone="ok" loading={q.isLoading} value={format.number(a && app(a))} hint={t && `${format.number(app(t))} today · web ${format.number(a?.web)} (${format.number(t.web)} today)`} />
        <StatCard
          label="Android downloads"
          icon={Download}
          tone="neutral"
          loading={q.isLoading}
          value={format.number(r?.downloads.inWindow)}
          hint={r && `from the website · ${format.number(r.downloads.allTime)} all time${r.downloads.github != null ? ` · GitHub: ${format.number(r.downloads.github)}` : ""}`}
        />
      </div>

      <Card>
        <CardHeader title="Sign-ups per day" description="Where each new account was made." />
        <CardBody>
          <TimeSeriesChart
            kind="bar"
            data={daily}
            loading={q.isLoading}
            height={200}
            series={[
              { key: "appSignups", label: "App", color: 1 },
              { key: "webSignups", label: "Web", color: 3 },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="People using Vibe per day" description="Someone who used both the app and the web that day counts in each." />
        <CardBody>
          <TimeSeriesChart
            data={daily}
            loading={q.isLoading}
            height={200}
            series={[
              { key: "appActive", label: "App", color: 1 },
              { key: "webActive", label: "Web", color: 3 },
            ]}
          />
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="All accounts" description="Every account ever, by where it was made." />
          <CardBody>
            <Table>
              <thead>
                <Tr>
                  <Th>Made in</Th>
                  <Th className="text-right">Accounts</Th>
                </Tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Android app", r?.signupsAllTime.android],
                    ["iPhone app", r?.signupsAllTime.ios],
                    ["Web", r?.signupsAllTime.web],
                    ["Not known (very old accounts)", r?.signupsAllTime.unknown],
                  ] as const
                ).map(([label, n]) => (
                  <Tr key={label}>
                    <Td>{label}</Td>
                    <Td className="text-right tabular-nums">{format.number(n)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Where downloads came from" description="“Download for Android” on the website, by traffic source." />
          <CardBody>
            {r?.downloads.bySource.length ? (
              <Table>
                <thead>
                  <Tr>
                    <Th>Source</Th>
                    <Th className="text-right">Downloads</Th>
                  </Tr>
                </thead>
                <tbody>
                  {r.downloads.bySource.map((d) => (
                    <Tr key={d.source}>
                      <Td className="capitalize">{d.source}</Td>
                      <Td className="text-right tabular-nums">{format.number(d.downloads)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="text-sm text-muted">{q.isLoading ? "Loading…" : "No downloads from the website in this period yet."}</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
