"use client";

import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";

import type { Page } from "@/lib/api/types";

/**
 * Cursor-paged list: first page on mount, "Load more" fetches the next.
 * Works the same for every list in the panel, and never asks the database
 * for an expensive total count.
 */
export function useCursorQuery<T>(key: QueryKey, fetchPage: (cursor: string | undefined, signal: AbortSignal) => Promise<Page<T>>, opts: { enabled?: boolean; refetchInterval?: number } = {}) {
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam, signal }) => fetchPage(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: opts.enabled,
    refetchInterval: opts.refetchInterval,
  });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  return {
    rows,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    isFetchingNextPage: q.isFetchingNextPage,
    error: q.error,
    hasNextPage: q.hasNextPage,
    fetchNextPage: () => void q.fetchNextPage(),
    refetch: () => void q.refetch(),
  };
}
