"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { errorMessage } from "@/lib/api/errors";
import { toast } from "@/stores/ui";

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * A cursor-paged list that loads the next page by itself as you scroll:
 * put `sentinel` on an element after the last row. `items` is null until
 * the first page arrives.
 */
export function usePaged<T>(fetchPage: (cursor: string | null) => Promise<Page<T>>, key = "") {
  const [items, setItems] = useState<T[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const fetchRef = useRef(fetchPage);
  useEffect(() => {
    fetchRef.current = fetchPage;
  });

  const load = useCallback(async (from: string | null, reset: boolean) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const page = await fetchRef.current(from);
      setItems((prev) => (reset ? page.items : [...(prev ?? []), ...page.items]));
      setCursor(page.nextCursor);
    } catch (e) {
      toast(errorMessage(e), { error: true });
      setItems((prev) => prev ?? []);
      setCursor(null);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(null, true);
  }, [load, key]);

  const observer = useRef<IntersectionObserver | null>(null);
  const sentinel = useCallback(
    (el: HTMLElement | null) => {
      observer.current?.disconnect();
      if (!el || !cursor) return;
      observer.current = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) void load(cursor, false);
      }, { rootMargin: "400px 0px" });
      observer.current.observe(el);
    },
    [cursor, load],
  );

  return { items, loading, hasMore: cursor != null, sentinel };
}
