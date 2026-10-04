"use client";

import { ChevronDown } from "lucide-react";
import * as React from "react";

import { EmptyState, ErrorState } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { Checkbox, Skeleton } from "@/components/ui/controls";
import { cn } from "@/lib/utils";

export interface Column<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Tailwind width/visibility classes, e.g. "w-40 hidden lg:table-cell". */
  className?: string;
  align?: "left" | "right" | "center";
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  /** Row id → selected; enables checkboxes. */
  selection?: { selected: Set<string>; onChange: (next: Set<string>) => void; isSelectable?: (row: T) => boolean };
  empty?: { title: string; description?: React.ReactNode; icon?: React.ComponentProps<typeof EmptyState>["icon"] };
  /** Cursor paging. */
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  rowClassName?: (row: T) => string | undefined;
  className?: string;
  /** Rendered above the table inside the card (filters, bulk bar). */
  toolbar?: React.ReactNode;
}

/**
 * The one list component: columns as data, server-side paging with "Load
 * more", loading/empty/error states, optional selection and row click.
 * Every list in the panel uses it, so they all look and behave alike.
 */
export function DataTable<T>({ columns, rows, getRowId, loading, error, onRetry, onRowClick, selection, empty, hasMore, loadingMore, onLoadMore, rowClassName, className, toolbar }: DataTableProps<T>) {
  const selectable = selection ? rows.filter((r) => selection.isSelectable?.(r) ?? true) : [];
  const allChecked = selection && selectable.length > 0 && selectable.every((r) => selection.selected.has(getRowId(r)));
  const someChecked = selection && selectable.some((r) => selection.selected.has(getRowId(r)));
  const align = (a?: Column<T>["align"]) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");

  const toggleAll = () => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (allChecked) selectable.forEach((r) => next.delete(getRowId(r)));
    else selectable.forEach((r) => next.add(getRowId(r)));
    selection.onChange(next);
  };

  return (
    <div className={cn("overflow-hidden rounded-xl border border-line bg-surface shadow-card", className)}>
      {toolbar}
      {error && !rows.length ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-surface-2/60">
              <tr>
                {selection && (
                  <th className="w-10 border-b border-line pl-4">
                    <Checkbox aria-label="Select all" checked={allChecked ? true : someChecked ? "indeterminate" : false} onCheckedChange={toggleAll} disabled={!selectable.length} />
                  </th>
                )}
                {columns.map((c) => (
                  <th key={c.id} scope="col" className={cn("h-9 border-b border-line px-3 text-xs font-medium whitespace-nowrap text-muted first:pl-4 last:pr-4", align(c.align), c.className)}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && !rows.length
                ? Array.from({ length: 6 }, (_, i) => (
                    <tr key={i}>
                      {selection && <td className="border-b border-line pl-4" />}
                      {columns.map((c) => (
                        <td key={c.id} className={cn("h-12 border-b border-line px-3 first:pl-4 last:pr-4", c.className)}>
                          <Skeleton className="h-4 w-full max-w-36" />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows.map((row) => {
                    const id = getRowId(row);
                    const checked = selection?.selected.has(id) ?? false;
                    return (
                      <tr
                        key={id}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                        onKeyDown={onRowClick ? (e) => e.key === "Enter" && e.target === e.currentTarget && onRowClick(row) : undefined}
                        tabIndex={onRowClick ? 0 : undefined}
                        className={cn("group transition-colors", onRowClick && "cursor-pointer hover:bg-surface-2/70 focus-visible:bg-surface-2", checked && "bg-primary-soft/50", rowClassName?.(row))}
                      >
                        {selection && (
                          <td className="w-10 border-b border-line pl-4" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              aria-label="Select row"
                              checked={checked}
                              disabled={!(selection.isSelectable?.(row) ?? true)}
                              onCheckedChange={(v) => {
                                const next = new Set(selection.selected);
                                if (v) next.add(id);
                                else next.delete(id);
                                selection.onChange(next);
                              }}
                            />
                          </td>
                        )}
                        {columns.map((c) => (
                          <td key={c.id} className={cn("h-12 border-b border-line px-3 align-middle first:pl-4 last:pr-4 group-last:border-b-0", align(c.align), c.className)}>
                            {c.cell(row)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
            </tbody>
          </table>
          {!loading && !rows.length && !error && <EmptyState title={empty?.title ?? "Nothing here"} description={empty?.description} icon={empty?.icon} />}
        </div>
      )}
      {(hasMore || (rows.length > 0 && onLoadMore)) && (
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
          <span className="text-xs text-muted tabular">
            {rows.length} shown{hasMore ? "" : " · end of list"}
          </span>
          {hasMore && (
            <Button size="sm" variant="ghost" onClick={onLoadMore} loading={loadingMore}>
              <ChevronDown />
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
