"use client";

import { useQuery } from "@tanstack/react-query";
import { Coins, Eye, Filter, Heart, HeartHandshake, PhoneMissed, Settings2, Star, Timer, Undo2, Video, VideoOff } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Time } from "@/components/common/bits";
import { EmptyState, ErrorState, PageHeader } from "@/components/common/page";
import { StatCard } from "@/components/common/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/controls";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import type { DiscoverCallsReport } from "@/lib/api/types";
import { format } from "@/lib/format";

export const discoverKeys = {
  report: (days: number) => ["dashboard", "discover", days] as const,
};

const share = (n: number, of: number) => (of > 0 ? format.percent(n / of) : "—");

/**
 * Discover (swipes and matches) and video calls in chat (asks, both
 * allowed, calls, missed). Prices and limits live in Economy → Discover
 * and Economy → Video calls in chat.
 */
export function DiscoverPage() {
  const [days, setDays] = React.useState(7);
  const q = useQuery({
    queryKey: discoverKeys.report(days),
    queryFn: ({ signal }) => api.get<DiscoverCallsReport>("admin/dashboard/discover", { days }, signal),
  });
  const r = q.data;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = r?.discover;
  const c = r?.calls;
  const likes = d ? d.likes + d.superLikes : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Discover and calls"
        description={
          r ? (
            <>
              Last {days} days · updated <Time iso={r.generatedAt} />
            </>
          ) : (
            "Swipes, matches and video calls between friends."
          )
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href="/economy" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium text-text-2 hover:text-text">
              <Settings2 className="size-3.5" aria-hidden /> Prices and limits
            </Link>
            <Segmented
              value={days}
              onChange={setDays}
              options={[
                { value: 1, label: "Today" },
                { value: 7, label: "7 days" },
                { value: 30, label: "30 days" },
              ]}
            />
          </div>
        }
      />

      <Card>
        <CardHeader title="Discover" description="The swipe deck. A match makes two people friends and opens their chat." />
        <CardBody>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard label="In decks right now" icon={Eye} tone="trust" loading={q.isLoading} value={format.number(d?.visibleNow)} hint="real, active, with a photo" />
            <StatCard label="Likes" icon={Heart} tone="primary" loading={q.isLoading} value={format.number(likes)} hint={d && `${format.number(d.superLikes)} Super Likes · ${format.number(d.swipers)} people swiping`} />
            <StatCard label="Matches" icon={HeartHandshake} tone="ok" loading={q.isLoading} value={format.number(d?.matches)} hint={d && `${share(d.matches * 2, likes)} of likes became a match`} />
            <StatCard label="Likes waiting" icon={Star} tone="neutral" loading={q.isLoading} value={format.number(d?.pendingLikes)} hint="not answered yet (all time)" />
          </div>
          <p className="mt-5 mb-2 text-xs font-medium uppercase tracking-wide text-muted">Coins spent in Discover</p>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard label="Filter passes" icon={Filter} tone="primary" loading={q.isLoading} value={format.number(d?.coins?.filterPasses)} hint={d?.coins && `${format.number(d.coins.filterPassesSold)} passes bought`} />
            <StatCard label="Super Likes" icon={Star} tone="trust" loading={q.isLoading} value={format.number(d?.coins?.superLikes)} hint="coins, after VIP free ones" />
            <StatCard label="More likes" icon={Coins} tone="ok" loading={q.isLoading} value={format.number(d?.coins?.likePacks)} hint="like packs" />
            <StatCard label="Undo" icon={Undo2} tone="neutral" loading={q.isLoading} value={format.number(d?.coins?.undo)} hint="coins" />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Video calls in chat" description="Calls need both people to allow them; either can turn them off. Calls are never recorded." />
        <CardBody>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard label="Asked to allow calls" icon={Video} tone="primary" loading={q.isLoading} value={format.number(c?.asked)} hint={c && `${format.number(c.allowed)} said yes · ${format.number(c.notNow)} not now`} />
            <StatCard label="Chats with calls on" icon={Video} tone="ok" loading={q.isLoading} value={format.number(c?.chatsWithCallsOn)} hint={c && `${format.number(c.turnedOff)} turned off in this period`} />
            <StatCard label="Calls" icon={Timer} tone="trust" loading={q.isLoading} value={format.number(c?.calls)} hint={c && `average ${format.duration(c.avgSeconds)}`} />
            <StatCard
              label="Missed or declined"
              icon={PhoneMissed}
              tone={c && c.reported > 0 ? "warn" : "neutral"}
              loading={q.isLoading}
              value={format.number(c ? c.missed + c.declined : undefined)}
              hint={c && `${format.number(c.missed)} missed · ${format.number(c.declined)} declined · ${format.number(c.reported)} reported`}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Recent calls between friends" description="Who called whom and how it ended. No audio or video is kept." />
        {r && !r.recentCalls.length ? (
          <CardBody>
            <EmptyState icon={VideoOff} title="No calls yet" description="Friend calls show up here once people allow calls in a chat and call." />
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <Tr>
                  <Th>When</Th>
                  <Th>Caller</Th>
                  <Th>Answered by</Th>
                  <Th className="text-right">Length</Th>
                  <Th>Ended</Th>
                </Tr>
              </thead>
              <tbody>
                {(r?.recentCalls ?? []).map((call) => (
                  <Tr key={call.id}>
                    <Td>
                      <Time iso={call.startedAt} />
                    </Td>
                    <Td>
                      <Link href={`/users/${call.a.id}`} className="text-primary hover:underline">
                        {call.a.name}
                      </Link>
                    </Td>
                    <Td>
                      <Link href={`/users/${call.b.id}`} className="text-primary hover:underline">
                        {call.b.name}
                      </Link>
                    </Td>
                    <Td className="text-right tabular">{call.seconds == null ? <Badge tone="ok">Live</Badge> : format.duration(call.seconds)}</Td>
                    <Td>{call.endReason ? <Badge tone={call.endReason === "REPORTED" ? "bad" : "neutral"}>{format.enum(call.endReason)}</Badge> : "—"}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
