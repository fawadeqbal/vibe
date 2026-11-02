"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { format } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 1 … 4 5 6 … 12: first, last and the pages next to the current one. */
export function pageNumbers(page: number, pages: number): (number | "gap")[] {
  const keep = [...new Set([1, pages, page - 1, page, page + 1])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  keep.forEach((n, i) => {
    if (i > 0 && n - keep[i - 1] > 1) out.push("gap");
    out.push(n);
  });
  return out;
}

/** "1–20 of 143 visits", rows per page, and ‹ Prev 1 2 3 … 8 Next ›. */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  sizes = [10, 20, 50, 100],
  noun = "rows",
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize?: (n: number) => void;
  sizes?: number[];
  noun?: string;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);
  return (
    <nav aria-label="Pages" className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/40 px-4 py-3", className)}>
      <div className="flex flex-wrap items-center gap-3 text-xs text-text-2">
        <span className="tabular-nums">
          {format.number(from)}–{format.number(to)} of {format.number(total)} {noun}
        </span>
        {onPageSize ? (
          <label className="flex items-center gap-1.5">
            Rows
            <NativeSelect value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="h-8 w-[4.5rem] text-xs" aria-label="Rows per page">
              {sizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
          </label>
        ) : null}
      </div>
      {pages > 1 ? (
        <div className="flex flex-wrap items-center gap-1">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
            <ChevronLeft />
            <span className="hidden sm:inline">Prev</span>
          </Button>
          {pageNumbers(page, pages).map((n, i) =>
            n === "gap" ? (
              <span key={`g${i}`} className="w-6 text-center text-muted" aria-hidden>
                …
              </span>
            ) : (
              <Button key={n} size="sm" variant={n === page ? "primary" : "ghost"} aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)} className="min-w-8 px-2 tabular-nums">
                {n}
              </Button>
            ),
          )}
          <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
            <span className="hidden sm:inline">Next</span>
            <ChevronRight />
          </Button>
        </div>
      ) : null}
    </nav>
  );
}
