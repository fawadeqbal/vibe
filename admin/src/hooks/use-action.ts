"use client";

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * A write action with the house rules built in: success toast, refresh the
 * affected queries, errors toasted by the global handler.
 *
 *   const ban = useAction((b: BanInput) => api.post(`admin/users/${id}/ban`, b), {
 *     success: "Banned", invalidate: [userKeys.detail(id), userKeys.lists()] })
 */
export function useAction<TInput = void, TResult = unknown>(fn: (input: TInput) => Promise<TResult>, opts: { success?: string | ((r: TResult) => string); invalidate?: QueryKey[]; onSuccess?: (r: TResult, input: TInput) => void } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r, input) => {
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(r) : opts.success);
      await Promise.all((opts.invalidate ?? []).map((queryKey) => qc.invalidateQueries({ queryKey })));
      opts.onSuccess?.(r, input);
    },
  });
}
