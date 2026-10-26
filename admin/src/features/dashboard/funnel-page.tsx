"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  Clock,
  Hourglass,
  SkipForward,
  UserCheck,
} from "lucide-react";
import * as React from "react";

import { Time } from "@/components/common/bits";
import { EmptyState, ErrorState, PageHeader } from "@/components/common/page";
import { StatCard } from "@/components/common/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/controls";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import type { FunnelReport } from "@/lib/api/types";
import { format } from "@/lib/format";
import { cn } from "@/lib/utils";

import { dropFrom, minutesLabel, share } from "./funnel-format";

export const funnelKeys = {
  report: (days: number) => ["dashboard", "funnel", days] as const,
};

/**
 * Where new people drop off: of everyone who signed up in the window, how
 * many set up a profile, had a first call, came back the next day and paid.
 * Each bar is a share of sign-ups; the biggest fall between neighbours is
 * flagged, since that's the step to work on first.
 */
export function FunnelPage() {
  const [days, setDays] = React.useState(30);
  const q = useQuery({
    queryKey: funnelKeys.report(days),
    queryFn: ({ signal }) =>
      api.get<FunnelReport>("admin/dashboard/funnel", { days }, signal),
  });
  const f = q.data;

  if (q.error)
    return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  const signups = f?.steps[0]?.count ?? 0;
  const firstCalls = f?.steps.find((s) => s.key === "firstCall")?.count ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Funnel"
        description={
          f ? (
            <>
              New people who signed up in the last {days} days · updated{" "}
              <Time iso={f.generatedAt} />
            </>
          ) : (
            "Where new people drop off, from sign-up to paying."
          )
        }
        actions={
          <Segmented
            value={days}
            onChange={setDays}
            options={[
              { value: 7, label: "7 days" },
              { value: 30, label: "30 days" },
              { value: 90, label: "90 days" },
            ]}
          />
        }
      />

      <Card>
        <CardHeader
          title="From sign-up to paying"
          description="Each bar is a share of everyone who signed up. “Came back” only counts days whose next day is over."
        />
        <CardBody className="space-y-3.5">
          {q.isLoading ? (
            <div className="space-y-3.5" aria-busy>
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-10 animate-pulse rounded-lg bg-surface-2"
                />
              ))}
            </div>
          ) : !f || signups === 0 ? (
            <EmptyState
              title="No sign-ups in this window"
              description="Pick a longer range, or check back once people have joined."
            />
          ) : (
            f.steps.map((step, i) => {
              const drop = i > 0 ? dropFrom(f.steps[i - 1], step) : null;
              const worst = f.biggestDrop === step.key;
              return (
                <div key={step.key} title={step.hint}>
                  <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-text">
                      {step.label}
                    </span>
                    <span className="text-sm font-semibold text-text tabular">
                      {format.number(step.count)}
                    </span>
                    {step.key !== "signedUp" && (
                      <span className="text-xs text-muted tabular">
                        {format.percent(step.rate)}{" "}
                        {step.eligible !== signups
                          ? `of ${format.number(step.eligible)} who could`
                          : "of sign-ups"}
                      </span>
                    )}
                    {worst && drop != null && (
                      <Badge tone="warn" className="ml-auto">
                        Biggest drop · −{Math.round(drop * 100)} pts
                      </Badge>
                    )}
                  </div>
                  <div
                    className="h-3 overflow-hidden rounded-full bg-surface-2"
                    role="img"
                    aria-label={`${step.label}: ${format.percent(step.rate)}`}
                  >
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width]",
                        worst ? "bg-warn" : "bg-primary",
                      )}
                      style={{
                        width: `${Math.max(step.rate > 0 ? 1.5 : 0, step.rate * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted">{step.hint}</p>
                </div>
              );
            })
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard
          label="Time to first call"
          icon={Clock}
          tone="primary"
          loading={q.isLoading}
          value={minutesLabel(f?.extras.medianMinutesToFirstCall)}
          hint="median, sign-up → first match"
        />
        <StatCard
          label="First call within 1 hour"
          icon={Hourglass}
          tone="trust"
          loading={q.isLoading}
          value={share(f?.extras.firstCallWithinHour, signups)}
          hint={
            f &&
            `${format.number(f.extras.firstCallWithinHour)} of ${format.number(signups)} sign-ups`
          }
        />
        <StatCard
          label="First call skipped < 10 s"
          icon={SkipForward}
          tone={
            f &&
            firstCalls > 0 &&
            f.extras.firstCallQuickSkip / firstCalls > 0.5
              ? "warn"
              : "neutral"
          }
          loading={q.isLoading}
          value={share(f?.extras.firstCallQuickSkip, firstCalls)}
          hint={
            f &&
            `${format.number(f.extras.firstCallQuickSkip)} of ${format.number(firstCalls)} first calls`
          }
        />
        <StatCard
          label="Complete profile"
          icon={UserCheck}
          tone="neutral"
          loading={q.isLoading}
          value={share(f?.extras.profileComplete, signups)}
          hint="photo, bio and 3 interests"
        />
        <StatCard
          label="Verified"
          icon={BadgeCheck}
          tone="trust"
          loading={q.isLoading}
          value={share(f?.extras.verified, signups)}
          hint={f && `${format.number(f.extras.verified)} people`}
        />
      </div>

      <Card>
        <CardHeader
          title="By sign-up day"
          description="Newest first. Each cell is a share of that day's sign-ups."
        />
        <CardBody className="px-0 py-0">
          <Table>
            <thead>
              <tr>
                <Th>Signed up</Th>
                <Th className="text-right">People</Th>
                <Th className="text-right">Set up</Th>
                <Th className="text-right">First call</Th>
                <Th className="text-right">Came back</Th>
                <Th className="text-right">Paid</Th>
              </tr>
            </thead>
            <tbody>
              {(f?.cohorts ?? [])
                .slice()
                .reverse()
                .map((c) => (
                  <Tr
                    key={c.day}
                    className={cn(c.signups === 0 && "text-muted")}
                  >
                    <Td className="whitespace-nowrap">
                      {format.date(`${c.day}T12:00:00Z`)}
                    </Td>
                    <Td className="text-right tabular">
                      {format.number(c.signups)}
                    </Td>
                    <Td className="text-right tabular">
                      {share(c.setUp, c.signups)}
                    </Td>
                    <Td className="text-right tabular">
                      {share(c.firstCall, c.signups)}
                    </Td>
                    <Td className="text-right tabular">
                      {c.cameBack == null ? (
                        <span className="text-xs text-muted">too soon</span>
                      ) : (
                        share(c.cameBack, c.signups)
                      )}
                    </Td>
                    <Td className="text-right tabular">
                      {share(c.paid, c.signups)}
                    </Td>
                  </Tr>
                ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
