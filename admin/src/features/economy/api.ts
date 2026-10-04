"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api/client";
import type { Economy, EconomySectionKey } from "@/lib/api/types";

export const economyKey = ["economy"] as const;

export const useEconomy = () => useQuery({ queryKey: economyKey, queryFn: ({ signal }) => api.get<Economy>("admin/economy", undefined, signal) });

interface SaveResult {
  section: EconomySectionKey;
  changes: string[];
  economy: Economy;
}

/**
 * Saves one section. `base` is what the editor started from, so the server
 * can refuse a save that would overwrite someone else's newer change.
 */
export function useSaveSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ section, value, base }: { section: EconomySectionKey; value: unknown; base?: unknown }) => api.put<SaveResult>(`admin/economy/${section}`, { value, base }),
    // Errors are shown inside the card being edited, not as a toast.
    meta: { silent: true },
    onSuccess: (r) => {
      qc.setQueryData(economyKey, r.economy);
      toast.success(r.changes.length ? "Saved — the apps have the new values" : "Nothing changed");
    },
  });
}

export function useResetSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (section: EconomySectionKey) => api.post<SaveResult>(`admin/economy/${section}/reset`),
    onSuccess: (r) => {
      qc.setQueryData(economyKey, r.economy);
      toast.success("Back to the default values");
    },
  });
}
