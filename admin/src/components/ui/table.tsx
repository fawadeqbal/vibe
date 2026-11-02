import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Table primitives. Lists use <DataTable>; these are for small static tables.
 * On phones a wide table scrolls sideways and its first column (the row
 * name) stays put, so you always know which row a number belongs to.
 */
const STICKY_FIRST = "max-sm:first:sticky max-sm:first:left-0 max-sm:first:z-[1] max-sm:first:bg-surface max-sm:first:shadow-[inset_-1px_0_0_var(--color-line)]";
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn(STICKY_FIRST, "h-9 border-b border-line px-3 text-left text-xs font-medium whitespace-nowrap text-muted first:pl-4 last:pr-4", className)} {...props} />;
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn(STICKY_FIRST, "h-11 border-b border-line px-3 align-middle text-text first:pl-4 last:pr-4", className)} {...props} />;
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors last:[&>td]:border-b-0", className)} {...props} />;
}
