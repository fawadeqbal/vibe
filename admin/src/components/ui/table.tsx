import * as React from "react";

import { cn } from "@/lib/utils";

/** Table primitives. Lists use <DataTable>; these are for small static tables. */
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("h-9 border-b border-line px-3 text-left text-xs font-medium whitespace-nowrap text-muted first:pl-4 last:pr-4", className)} {...props} />;
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("h-11 border-b border-line px-3 align-middle text-text first:pl-4 last:pr-4", className)} {...props} />;
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors last:[&>td]:border-b-0", className)} {...props} />;
}
