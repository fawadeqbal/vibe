import { AlertTriangle, Inbox, type LucideIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Title row of every screen: breadcrumb, title, one-line description, actions. */
export function PageHeader({
  title,
  description,
  actions,
  back,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-5">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-text">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-text">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: { icon?: LucideIcon; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Icon className="size-5" />
      </div>
      <p className="text-sm font-medium text-text">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const e = error as { message?: string; code?: string; requestId?: string; isForbidden?: boolean };
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)} role="alert">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-bad-soft text-bad">
        <AlertTriangle className="size-5" />
      </div>
      <p className="text-sm font-medium text-text">{e?.isForbidden ? "You don't have access to this" : "Couldn't load this"}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{e?.isForbidden ? "Ask an owner to add the permission to your role." : (e?.message ?? "Something went wrong.")}</p>
      {e?.requestId && <p className="mt-1 font-mono text-[11px] text-muted">ref {e.requestId}</p>}
      {onRetry && !e?.isForbidden && (
        <Button size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Label/value grid for detail panels. */
export function DescriptionList({ items, columns = 2, className }: { items: { label: React.ReactNode; value: React.ReactNode; hidden?: boolean }[]; columns?: 1 | 2 | 3; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3", columns === 1 ? "grid-cols-1" : columns === 3 ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-1 sm:grid-cols-2", className)}>
      {items
        .filter((i) => !i.hidden)
        .map((i, idx) => (
          <div key={idx} className="min-w-0">
            <dt className="text-xs text-muted">{i.label}</dt>
            <dd className="mt-0.5 truncate text-sm text-text">{i.value}</dd>
          </div>
        ))}
    </dl>
  );
}

export function Section({ title, description, actions, children, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
