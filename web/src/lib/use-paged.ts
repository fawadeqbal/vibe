"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PageResult<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * A list that loads a page at a time and the next one as you scroll near
 * the end (put `sentinel` on an element after the last row). Changing
 * `key` (a filter) starts over. Pages are added once each, even if the
 * sentinel shows twice.
 */
export function usePaged<T extends { id: string }>(key: string, fetchPage: (cursor: string | null) => Promise<PageResult<T>>) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const generation = useRef(0);
  const fetchRef = useRef(fetchPage);
  useEffect(() => {
    fetchRef.current = fetchPage;
  });

  const load = useCallback(async (from: string | null, gen: number) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setFailed(false);
    if (!from) setDone(false);
    try {
      const page = await fetchRef.current(from);
      if (gen !== generation.current) return;
      setItems((prev) => {
        const base = from ? prev : [];
        const seen = new Set(base.map((i) => i.id));
        return [...base, ...page.items.filter((i) => !seen.has(i.id))];
      });
      setCursor(page.nextCursor);
      setDone(page.nextCursor == null);
    } catch {
      if (gen === generation.current) setFailed(true);
    } finally {
      busy.current = false;
      if (gen === generation.current) setLoading(false);
    }
  }, []);

  // A new key (filter): start over (the first page replaces what was there).
  useEffect(() => {
    const gen = ++generation.current;
    busy.current = false;
    const t = setTimeout(() => void load(null, gen), 0);
    return () => clearTimeout(t);
  }, [key, load]);

  const more = useCallback(() => {
    if (done || !cursor) return;
    void load(cursor, generation.current);
  }, [cursor, done, load]);

  // The sentinel: when it comes near the screen, load the next page.
  const observer = useRef<IntersectionObserver | null>(null);
  const sentinel = useCallback(
    (el: HTMLElement | null) => {
      observer.current?.disconnect();
      if (!el) return;
      observer.current = new IntersectionObserver((e) => e[0]?.isIntersecting && more(), { rootMargin: "600px" });
      observer.current.observe(el);
    },
    [more],
  );

  const retry = () => void load(items.length ? cursor : null, generation.current);
  return { items, loading, done, failed, sentinel, retry, loaded: done || items.length > 0 };
}
