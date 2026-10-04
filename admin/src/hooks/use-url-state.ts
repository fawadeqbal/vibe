"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

type Value = string | string[] | undefined;
export type UrlState<T extends Record<string, Value>> = { [K in keyof T]: T[K] };

/**
 * Filters live in the URL (`?status=OPEN&q=sara`), so every filtered view
 * can be bookmarked, shared, and survives a reload. Values are strings or
 * string lists; defaults are left out of the URL.
 *
 *   const [f, setF] = useUrlState({ q: '', status: ['OPEN'] as string[] })
 */
export function useUrlState<T extends Record<string, Value>>(defaults: T): [UrlState<T>, (patch: Partial<UrlState<T>>) => void, () => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Defaults are fixed for the life of the component.
  const [defs] = React.useState(defaults);

  const state = React.useMemo(() => {
    const out: Record<string, Value> = {};
    for (const [k, d] of Object.entries(defs)) {
      const raw = params.get(k);
      if (raw === null) out[k] = d;
      else out[k] = Array.isArray(d) ? raw.split(",").filter(Boolean) : raw;
    }
    return out as UrlState<T>;
  }, [params, defs]);

  const write = React.useCallback(
    (next: Record<string, Value>) => {
      const p = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        const d = defs[k];
        const same = Array.isArray(v) ? Array.isArray(d) && v.join(",") === d.join(",") : v === d;
        if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0 && !(Array.isArray(d) && d.length > 0)) || same) p.delete(k);
        else p.set(k, Array.isArray(v) ? v.join(",") : v);
      }
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router, defs],
  );

  const set = React.useCallback((patch: Partial<UrlState<T>>) => write(patch as Record<string, Value>), [write]);
  const reset = React.useCallback(() => write(Object.fromEntries(Object.keys(defs).map((k) => [k, undefined]))), [write, defs]);
  return [state, set, reset];
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
