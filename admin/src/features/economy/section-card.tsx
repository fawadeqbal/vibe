"use client";

import { Pencil, RefreshCw, RotateCcw } from "lucide-react";
import * as React from "react";

import { Time } from "@/components/common/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/controls";
import { ApiError } from "@/lib/api/client";
import type { EconomySectionMeta } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * One block of the Economy page. Read-only until the pencil is pressed;
 * then the body becomes a form with Save / Cancel, and the server's answer
 * (validation, or "someone else changed this") is shown right here.
 */
export function SectionCard({
  title,
  description,
  meta,
  changedFromDefault,
  canEdit,
  editing,
  onEdit,
  onCancel,
  onSave,
  saving,
  saveDisabled,
  onReset,
  error,
  onReload,
  footer,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  meta?: EconomySectionMeta;
  changedFromDefault: boolean;
  canEdit: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  onReset?: () => void;
  error?: unknown;
  onReload?: () => void;
  /** Replaces the "changed by" line. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const id = React.useId();
  const stale = error instanceof ApiError && error.status === 409;
  return (
    <Card role="region" className={cn("flex flex-col", editing && "ring-2 ring-primary/40", className)} aria-labelledby={id}>
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 id={id} className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text">
            {title}
            {changedFromDefault && <Badge tone="warn">Changed</Badge>}
            {editing && <Badge tone="primary">Editing</Badge>}
          </h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={onSave} loading={saving} disabled={saveDisabled}>
                Save
              </Button>
            </>
          ) : (
            canEdit && (
              <Tooltip content={`Edit ${title.toLowerCase()}`}>
                <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${title}`}>
                  <Pencil />
                </Button>
              </Tooltip>
            )
          )}
        </div>
      </div>
      <div className="flex-1">{children}</div>
      {!!error && (
        <div role="alert" className="mx-4 mb-3 flex items-start justify-between gap-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          <span>{(error as Error).message}</span>
          {stale && onReload && (
            <Button size="xs" variant="ghost" className="shrink-0 text-bad" onClick={onReload}>
              <RefreshCw /> Load latest
            </Button>
          )}
        </div>
      )}
      <div className="flex min-h-10 items-center justify-between gap-3 border-t border-line px-4 py-2 text-xs text-muted">
        <span>
          {footer ?? (meta?.custom && meta.updatedAt ? (
            <>
              Changed by {meta.updatedBy ?? "someone"} <Time iso={meta.updatedAt} />
            </>
          ) : (
            "Vibe's default values"
          ))}
        </span>
        {editing && onReset && changedFromDefault && (
          <Button size="xs" variant="ghost" onClick={onReset} disabled={saving}>
            <RotateCcw /> Use defaults
          </Button>
        )}
      </div>
    </Card>
  );
}
