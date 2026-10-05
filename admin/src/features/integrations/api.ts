"use client";

import { useQuery } from "@tanstack/react-query";

import { useCursorQuery } from "@/hooks/use-cursor-query";
import { api, type Query } from "@/lib/api/client";
import type { IntegrationsOverview, Page, WebhookEvent, WebhookEventDetail } from "@/lib/api/types";

export const integrationKeys = {
  all: ["integrations"] as const,
  overview: ["integrations", "overview"] as const,
  webhooks: (q: Query) => ["integrations", "webhooks", q] as const,
  webhook: (id: string) => ["integrations", "webhook", id] as const,
};

/** Providers seen in the webhook log (filter options). */
export const WEBHOOK_PROVIDERS = ["google-play", "app-store", "jazzcash", "easypaisa", "card"];
export const WEBHOOK_STATUSES = ["RECEIVED", "PROCESSED", "IGNORED", "FAILED"];

/** `KEY=` lines to paste into the server's .env. */
export const envLines = (keys: string[]) => keys.map((k) => `${k}=`).join("\n");

/** payments.google_play → google-play (the provider name in the webhook log); null when it has no webhooks. */
export const webhookProviderFor = (key: string) => (key.startsWith("payments.") ? key.slice("payments.".length).replace(/_/g, "-") : null);

export function useIntegrations() {
  return useQuery({ queryKey: integrationKeys.overview, queryFn: ({ signal }) => api.get<IntegrationsOverview>("admin/integrations", undefined, signal), refetchInterval: 60_000 });
}

export function useWebhooks(q: Query) {
  return useCursorQuery<WebhookEvent>(integrationKeys.webhooks(q), (cursor, signal) => api.get<Page<WebhookEvent>>("admin/webhooks", { ...q, cursor, limit: 30 }, signal));
}

export function useWebhook(id: string | null) {
  return useQuery({ queryKey: integrationKeys.webhook(id ?? ""), queryFn: ({ signal }) => api.get<WebhookEventDetail>(`admin/webhooks/${id}`, undefined, signal), enabled: !!id });
}
