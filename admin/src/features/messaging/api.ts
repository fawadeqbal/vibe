"use client";

import { useQuery } from "@tanstack/react-query";

import { useDebounced } from "@/hooks/use-url-state";
import { useCursorQuery } from "@/hooks/use-cursor-query";
import { api, type Query } from "@/lib/api/client";
import type { AudienceCounts, Campaign, Delivery, InAppMessage, MailFields, MailTemplate, Page, RenderedMail } from "@/lib/api/types";

export const messagingKeys = {
  templates: ["messaging", "templates"] as const,
  template: (key: string) => ["messaging", "template", key] as const,
  starters: ["messaging", "starters"] as const,
  campaigns: (q: Query) => ["messaging", "campaigns", q] as const,
  campaign: (id: string) => ["messaging", "campaign", id] as const,
  deliveries: (id: string, q: Query) => ["messaging", "deliveries", id, q] as const,
};

export const FIELD_KEYS = ["subject", "preheader", "heading", "body", "highlight", "buttonLabel", "buttonUrl", "footer"] as const;
export const pickFields = (t: Partial<MailFields>): MailFields => Object.fromEntries(FIELD_KEYS.map((k) => [k, t[k] ?? ""])) as unknown as MailFields;

export const useTemplates = () =>
  useQuery({
    queryKey: messagingKeys.templates,
    queryFn: ({ signal }) => api.get<MailTemplate[]>("admin/mail-templates", undefined, signal),
  });
export const useTemplate = (key: string) =>
  useQuery({
    queryKey: messagingKeys.template(key),
    queryFn: ({ signal }) => api.get<MailTemplate>(`admin/mail-templates/${key}`, undefined, signal),
  });
export const useStarters = () =>
  useQuery({
    queryKey: messagingKeys.starters,
    queryFn: ({ signal }) => api.get<MailTemplate[]>("admin/mail-templates/starters", undefined, signal),
    staleTime: 60_000,
  });

/** Server-rendered preview of unsaved fields, so it matches the real e-mail exactly. */
export function useTemplatePreview(fields: MailFields, unsubscribe: boolean) {
  const debounced = useDebounced(fields, 350);
  return useQuery({
    queryKey: ["messaging", "preview", debounced, unsubscribe],
    queryFn: () =>
      api.post<RenderedMail>("admin/mail-templates/preview", {
        fields: debounced,
        unsubscribe,
      }),
    placeholderData: (prev) => prev,
    staleTime: Infinity,
  });
}

export function useMessagePreview(content: Omit<MailFields, "highlight">, userId?: string) {
  const debounced = useDebounced(content, 350);
  return useQuery({
    queryKey: ["messaging", "message-preview", debounced, userId],
    queryFn: () => api.post<{ email: RenderedMail; inApp: InAppMessage }>("admin/messages/preview", { ...debounced, userId }),
    placeholderData: (prev) => prev,
    staleTime: Infinity,
    enabled: !!debounced.subject.trim() && !!debounced.body.trim(),
  });
}

export function useAudience(spec: Record<string, unknown> | null) {
  const debounced = useDebounced(spec, 400);
  return useQuery({
    queryKey: ["messaging", "audience", debounced],
    queryFn: () => api.post<AudienceCounts>("admin/messages/audience", debounced),
    enabled: !!debounced,
    placeholderData: (prev) => prev,
  });
}

export const useCampaigns = (q: Query) =>
  useCursorQuery<Campaign>(messagingKeys.campaigns(q), (cursor, signal) => api.get<Page<Campaign>>("admin/messages", { ...q, cursor, limit: 30 }, signal), { refetchInterval: 5000 });

export const useCampaign = (id: string) =>
  useQuery({
    queryKey: messagingKeys.campaign(id),
    queryFn: ({ signal }) => api.get<Campaign>(`admin/messages/${id}`, undefined, signal),
    // Poll while it's going out.
    refetchInterval: (q) => (q.state.data && ["QUEUED", "SENDING"].includes(q.state.data.status) ? 2000 : false),
  });

export const useDeliveries = (id: string, q: Query) =>
  useCursorQuery<Delivery>(messagingKeys.deliveries(id, q), (cursor, signal) => api.get<Page<Delivery>>(`admin/messages/${id}/deliveries`, { ...q, cursor, limit: 30 }, signal));
