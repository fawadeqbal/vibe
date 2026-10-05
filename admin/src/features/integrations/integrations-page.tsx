"use client";

import { ExternalLink, KeyRound, Plug, Webhook } from "lucide-react";
import Link from "next/link";

import { CopyButton } from "@/components/common/bits";
import { EmptyState, ErrorState, PageHeader, Section } from "@/components/common/page";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/controls";
import type { IntegrationKind, IntegrationMode, IntegrationStatus, IntegrationsOverview } from "@/lib/api/types";
import { format } from "@/lib/format";
import { cn } from "@/lib/utils";

import { envLines, useIntegrations, webhookProviderFor } from "./api";

export const KIND_LABEL: Record<IntegrationKind, string> = {
  payment: "Payments",
  payout: "Payouts",
  login: "Sign-in",
  ads: "Ads",
  push: "Push",
  storage: "Storage",
  kyc: "Selfie verification",
  mail: "E-mail",
};
const KIND_ORDER = Object.keys(KIND_LABEL) as IntegrationKind[];

const MODE: Record<IntegrationMode, { tone: Tone; label: string }> = {
  live: { tone: "ok", label: "Live" },
  dev: { tone: "warn", label: "Test mode" },
  off: { tone: "bad", label: "Off" },
};

/** Which providers are live, which are test stand-ins, and which keys are still missing. */
export function IntegrationsPage() {
  const q = useIntegrations();
  const d = q.data;
  const allMissing = [...new Set((d?.items ?? []).flatMap((i) => i.missingEnv))];

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Each provider switches to live when its keys are in the server's .env. Dev = built-in test stand-in."
        actions={
          <>
            {allMissing.length > 0 && (
              <CopyButton value={envLines(allMissing)} label={`${allMissing.length} missing keys copied`} title="Copy every missing key as KEY= lines" className="h-8 border border-line bg-surface px-2.5 text-text shadow-card">
                Copy all missing keys
              </CopyButton>
            )}
            <Button size="sm" asChild>
              <Link href="/webhooks">
                <Webhook /> Webhooks
              </Link>
            </Button>
          </>
        }
      >
        {d && (
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Summary">
            {(["live", "dev", "off"] as const).map((m) => (
              <Badge key={m} tone={MODE[m].tone} dot className="h-7 px-2.5 text-sm">
                <span className="tabular">{d.summary[m]}</span> {MODE[m].label.toLowerCase()}
              </Badge>
            ))}
          </div>
        )}
      </PageHeader>

      {q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isLoading || !d ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : !d.items.length ? (
        <Card>
          <EmptyState icon={Plug} title="No integrations reported" />
        </Card>
      ) : (
        <div className="space-y-6">
          <WebhookSummary hooks={d.webhooks24h} />
          {KIND_ORDER.filter((k) => d.items.some((i) => i.kind === k)).map((kind) => (
            <Section key={kind} title={KIND_LABEL[kind]}>
              <div className="grid gap-3 md:grid-cols-2">
                {d.items
                  .filter((i) => i.kind === kind)
                  .map((i) => (
                    <IntegrationCard key={i.key} item={i} hooks={d.webhooks24h} />
                  ))}
              </div>
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}

function IntegrationCard({ item: i, hooks }: { item: IntegrationStatus; hooks: IntegrationsOverview["webhooks24h"] }) {
  const provider = webhookProviderFor(i.key);
  const mine = provider ? hooks.filter((h) => h.provider === provider) : [];
  const total = mine.reduce((a, h) => a + h.count, 0);
  const failed = mine.filter((h) => h.status === "FAILED").reduce((a, h) => a + h.count, 0);
  const mode = MODE[i.mode] ?? MODE.off;

  return (
    <Card className="flex flex-col gap-3 p-4" data-integration={i.key}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-text">{i.label}</h3>
          <p className="truncate font-mono text-[11px] text-muted">{i.key}</p>
        </div>
        <Badge tone={mode.tone} dot>
          {mode.label}
        </Badge>
      </div>

      {i.missingEnv.length > 0 ? (
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-text-2">
              <KeyRound className="size-3.5 text-warn" /> Missing {i.missingEnv.length} of {i.requiredEnv.length} key{i.requiredEnv.length === 1 ? "" : "s"}
            </p>
            <CopyButton value={envLines(i.missingEnv)} label="Keys copied" title={`Copy ${i.label} keys as KEY= lines`}>
              Copy
            </CopyButton>
          </div>
          <EnvChips keys={i.missingEnv} />
        </div>
      ) : i.requiredEnv.length > 0 && i.mode === "live" ? (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <KeyRound className="size-3.5 text-ok" /> All {i.requiredEnv.length} key{i.requiredEnv.length === 1 ? "" : "s"} set
        </p>
      ) : i.requiredEnv.length > 0 ? (
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-text-2">
              <KeyRound className="size-3.5 text-muted" /> Keys to go live
            </p>
            <CopyButton value={envLines(i.requiredEnv)} label="Keys copied" title={`Copy ${i.label} keys as KEY= lines`}>
              Copy
            </CopyButton>
          </div>
          <EnvChips keys={i.requiredEnv} />
        </div>
      ) : null}

      {!!i.endpoints?.length && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-2">Give the provider</p>
          <ul className="space-y-1">
            {i.endpoints.map((e) => (
              <li key={e.label + e.url} className="flex items-center gap-2 rounded-lg bg-surface-2 py-1 pr-1 pl-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-muted">{e.label}</p>
                  <p className="truncate font-mono text-xs text-text" title={e.url}>
                    {e.url}
                  </p>
                </div>
                <CopyButton value={e.url} label="URL copied" title={`Copy ${e.label}`} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {!!i.notes?.length && (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted">
          {i.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      {(provider || i.docsUrl) && (
        <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-line pt-2.5 text-xs">
          {provider && (
            <Link href={`/webhooks?provider=${provider}`} className="inline-flex items-center gap-1 text-muted hover:text-text">
              <Webhook className="size-3.5" />
              <span className="tabular">{format.number(total)}</span> webhook{total === 1 ? "" : "s"} in 24h
              {failed > 0 && (
                <Badge tone="bad" className="ml-1">
                  {failed} failed
                </Badge>
              )}
            </Link>
          )}
          {i.docsUrl && (
            <a href={i.docsUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-primary hover:underline">
              Provider docs <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}
    </Card>
  );
}

function EnvChips({ keys }: { keys: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {keys.map((k) => (
        <code key={k} className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] break-all text-text-2">
          {k}
        </code>
      ))}
    </div>
  );
}

/** Webhooks per provider in the last 24 hours, failed ones called out. */
function WebhookSummary({ hooks }: { hooks: IntegrationsOverview["webhooks24h"] }) {
  const byProvider = Object.entries(
    hooks.reduce<Record<string, { total: number; failed: number }>>((acc, h) => {
      const p = (acc[h.provider] ??= { total: 0, failed: 0 });
      p.total += h.count;
      if (h.status === "FAILED") p.failed += h.count;
      return acc;
    }, {}),
  ).sort((a, b) => b[1].total - a[1].total);

  return (
    <Section title="Webhooks, last 24 hours" description="Callbacks providers sent us. Failed ones are retried automatically for a while; you can retry by hand.">
      {!byProvider.length ? (
        <p className="text-sm text-muted">None received.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {byProvider.map(([provider, c]) => (
            <Link
              key={provider}
              href={`/webhooks?provider=${provider}${c.failed ? "&status=FAILED" : ""}`}
              className={cn("flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-card hover:border-line-strong", c.failed > 0 && "border-bad/40")}
            >
              <span className="font-medium text-text">{provider}</span>
              <span className="text-muted tabular">{format.number(c.total)}</span>
              {c.failed > 0 && <Badge tone="bad">{c.failed} failed</Badge>}
            </Link>
          ))}
        </div>
      )}
    </Section>
  );
}
